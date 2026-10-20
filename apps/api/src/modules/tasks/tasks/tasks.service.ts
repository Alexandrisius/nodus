import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type CreateTaskBody,
  type TaskListItem,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { actorRoles, audienceIds, planHolderIds, taskAccess } from '../access/task-access.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';
import { ChecklistRepository } from '../checklist/checklist.repository.js';
import { Placements } from '../personal/placements.js';
import { PlacementsRepository } from '../personal/placements.repository.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { TaskDtoMapper } from './task-dto.mapper.js';
import { TasksQueryService } from './tasks-query.service.js';
import { DuplicateTaskSourceError, TasksRepository } from './tasks.repository.js';

const OPEN_STATES = new Set(['backlog', 'active', 'paused']);

/**
 * Создание и удаление задач (правка и перенос — TaskEditService). Задача без
 * проекта и без колонки — обычный случай: встаёт в начальную стадию
 * маршрута своего типа и в «Мой план» держателей (структурный тип — нет).
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly repo: TasksRepository,
    private readonly checklist: ChecklistRepository,
    private readonly placementsRepo: PlacementsRepository,
    private readonly workflows: WorkflowRepository,
    private readonly placements: Placements,
    private readonly query: TasksQueryService,
    private readonly mapper: TaskDtoMapper,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
    @Inject(CHAT_MESSAGE_ACCESS) private readonly messages: ChatMessageAccess,
  ) {}

  /** Подзадача/перепривязка: родителя правят только те, кто может править
   *  его самого (наблюдатель или руководитель не блокируют чужую задачу
   *  гейтом «нет открытых подзадач» — находка security-гейта #37). */
  async assertCanEditParent(user: AuthUser, parentId: string): Promise<void> {
    const parent = await this.query.visibleRow(user, parentId);
    if (!taskAccess(actorRoles(parent, user.id), user.permissions).canEdit) {
      throw DomainException.forbidden('Parent task edit not allowed');
    }
  }

  /** Активные сотрудники из списка; иначе VALIDATION_FAILED (а не тихий пропуск). */
  async assertActiveUsers(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const active = await this.profiles.filterActiveUserIds(unique);
    if (active.length !== unique.length) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Unknown or inactive user', {
        userIds: unique.filter((id) => !active.includes(id)),
      });
    }
  }

  async create(user: AuthUser, body: CreateTaskBody): Promise<TaskListItem> {
    const assigneeId = body.assigneeId ?? user.id;
    const participants = this.participantRows(body, user.id, assigneeId);
    await this.assertActiveUsers([assigneeId, ...participants.map((p) => p.userId)]);
    if (body.parentId) await this.assertCanEditParent(user, body.parentId);
    const message = body.sourceMessageId
      ? await this.messages.snapshot(body.sourceMessageId, user.id)
      : null;
    if (body.sourceMessageId) {
      if (!message) throw DomainException.notFound('Message not found');
      const existing = await this.findBySource(user, body.sourceMessageId);
      if (existing) return existing;
    }
    const { typeId, workflowId, structural } = await this.workflows.resolveTypeWorkflow(
      body.typeId,
      // Скрытый тип недоступен ЯВНОМУ выбору и на сервере (security #378);
      // неявный «Стандартный» (плюсики колонок, подзадачи, «В задачу» из
      // чата) — системный запасной тип, создание по нему не ломается.
      { requireCreatable: body.typeId !== undefined },
    );
    const workflow = await this.workflows.load(workflowId);
    const personalColumn = body.personalStageId
      ? await this.personalColumn(user.id, body.personalStageId)
      : null;
    // Новая задача стартует только в ОТКРЫТОМ состоянии (backlog/active/
    // paused): создание сразу «завершённой» обходило бы гейты DoD
    // (security-гейт #37). Колонка «Моего плана» открытого состояния задаёт
    // стадию (плюсик в «В работе» = задача в работе); закрытая колонка —
    // начальная стадия.
    const starts = workflow.stages.filter((s) => !s.archivedAt && OPEN_STATES.has(s.systemState));
    const initial = starts.find((s) => s.isInitial) ?? starts[0];
    const stage = body.stageId
      ? starts.find((s) => s.id === body.stageId)
      : personalColumn && OPEN_STATES.has(personalColumn.systemState)
        ? (starts.find((s) => s.systemState === personalColumn.systemState) ?? initial)
        : initial;
    if (!stage) throw DomainException.notFound('Stage not found');
    const holders = planHolderIds({ creatorId: user.id, assigneeId, participants });
    await this.placements.prepare(structural ? [] : holders);

    const id = await this.txRunner
      .run(async (tx) => {
        const task = await this.repo.create(
          {
            title: body.title,
            description: body.description ?? '',
            typeId,
            workflowId,
            stageId: stage.id,
            systemState: stage.systemState,
            stageOrder: await this.repo.stageKeyAt(tx, stage.id, 0),
            priority: body.priority ?? 'normal',
            deadline: body.deadline ? new Date(body.deadline) : null,
            plannedMinutes: body.plannedMinutes ?? null,
            // Утверждение — статус маршрута (#378); поле БД живёт до #383.
            acceptRequired: false,
            creatorId: user.id,
            assigneeId,
            parentId: body.parentId ?? null,
            projectId: body.projectId ?? null,
            source: body.sourceMessageId ? 'chat_message' : 'manual',
            sourceId: body.sourceMessageId ?? null,
            checklistTotal: body.checklist?.length ?? 0,
            participants,
          },
          tx,
        );
        await this.checklist.createInitial(tx, task.id, body.checklist ?? []);
        await this.placements.sync(tx, task, holders, user.id);
        // Структурная задача размещений не имеет — колонку «Моего плана» не ставим.
        if (!structural && personalColumn?.systemState === task.systemState) {
          await this.placeInColumn(tx, task.id, user.id, personalColumn.id);
        }
        await this.eventBus.emit(
          tx,
          TASK_EVENTS.CREATED,
          {
            taskId: task.id,
            number: task.number,
            audience: audienceIds({ creatorId: user.id, assigneeId, participants }),
            title: task.title,
            creatorId: user.id,
            assigneeId,
            coexecutorIds: participants.filter((p) => p.role === 'coexecutor').map((p) => p.userId),
            observerIds: participants.filter((p) => p.role === 'observer').map((p) => p.userId),
            projectId: task.projectId,
            parentId: task.parentId,
            source: task.source,
            sourceId: task.sourceId,
          },
          { actorId: user.id, aggregateType: 'task', aggregateId: task.id },
        );
        return task.id;
      })
      .catch(async (error: unknown) => {
        // Параллельный клик «В задачу» проиграл unique-индексу дедупа: отдаём
        // задачу победителя — как первый ответ, без 409.
        if (!(error instanceof DuplicateTaskSourceError) || !body.sourceMessageId) throw error;
        const winner = await this.repo.findLiveIdBySource(user.id, body.sourceMessageId);
        if (!winner) throw error;
        return winner;
      });
    return this.listItem(user.id, id);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.query.visibleRow(user, id);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canDelete) {
      throw DomainException.forbidden('Only creator can delete task');
    }
    await this.txRunner.run(async (tx) => {
      // Дети поднимаются к ближайшему ЖИВОМУ предку (родитель мог быть мягко
      // удалён параллельно — снимок row устаревает). Очередь дерева — та же
      // advisory-блокировка, что у смены родителя: удаление и перепривязка
      // не перекрещиваются.
      await this.repo.lockTree(tx);
      const heir = await this.repo.liveAncestorId(tx, id);
      await this.repo.softDelete(tx, id, new Date());
      await this.repo.reparentChildren(tx, id, heir);
      await this.placementsRepo.removeAllForTask(tx, id);
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.DELETED,
        { taskId: id, number: row.number, audience: audienceIds(row) },
        { actorId: user.id, aggregateType: 'task', aggregateId: id },
      );
    });
  }

  async listItem(viewerId: string, id: string, tx?: TransactionClient): Promise<TaskListItem> {
    const row = await this.repo.findListRow(id, viewerId, tx);
    return (await this.mapper.toListItems([row], tx))[0]!;
  }

  /** Строки участников: ответственный и постановщик ролей не дублируют;
   *  соисполнитель сильнее наблюдателя. */
  private participantRows(body: CreateTaskBody, creatorId: string, assigneeId: string) {
    const skip = new Set([assigneeId]);
    const rows = new Map<string, 'coexecutor' | 'observer'>();
    for (const uid of body.observerIds ?? [])
      if (!skip.has(uid) && uid !== creatorId) rows.set(uid, 'observer');
    for (const uid of body.coexecutorIds ?? []) if (!skip.has(uid)) rows.set(uid, 'coexecutor');
    return [...rows].map(([userId, role]) => ({ userId, role, muted: role === 'observer' }));
  }

  private async personalColumn(userId: string, stageId: string) {
    const column = await this.workflows.findPersonalColumn(userId, stageId);
    if (!column) throw DomainException.notFound('Stage not found');
    return column;
  }

  async placeInColumn(tx: TransactionClient, taskId: string, userId: string, stageId: string) {
    const sortOrder = await this.placements.topKey(tx, userId, stageId);
    await this.placementsRepo.move(tx, { taskId, userId, stageId, sortOrder });
  }

  /** Дедуп «В задачу»: одна живая задача на сообщение у постановщика
   *  (у другого сотрудника — своя; чужие задачи не раскрываются — без
   *  оракула существования). Индекс — частичный unique в миграции. */
  private async findBySource(user: AuthUser, messageId: string): Promise<TaskListItem | null> {
    const found = await this.repo.findLiveIdBySource(user.id, messageId);
    return found ? this.listItem(user.id, found) : null;
  }
}
