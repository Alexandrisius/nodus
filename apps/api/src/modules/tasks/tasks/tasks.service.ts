import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type CreateTaskBody,
  type TaskListItem,
} from '@nodus/contracts';

import { PrismaService } from '../../../core/database/prisma.service.js';
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
import { keyBetween } from '../lib/fractional-index.js';
import { actorRoles, audienceIds, planHolderIds, taskAccess } from '../access/task-access.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';
import { Placements } from '../personal/placements.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { TaskDtoMapper } from './task-dto.mapper.js';
import { taskListInclude } from './task-row.js';
import { TasksQueryService } from './tasks-query.service.js';

const OPEN_STATES = new Set(['backlog', 'active', 'paused']);

/**
 * Создание и удаление задач (правка и перенос — TaskEditService). Задача без
 * проекта и без колонки — обычный случай: встаёт в начальную стадию
 * маршрута своего типа и в «Мой план» держателей.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
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
    const { typeId, workflowId } = await this.workflows.resolveTypeWorkflow(body.typeId);
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
    await this.placements.prepare(holders);

    const id = await this.txRunner.run(async (tx) => {
      const first = await tx.task.findFirst({
        where: { stageId: stage.id },
        orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
      });
      const task = await tx.task.create({
        data: {
          title: body.title,
          description: body.description ?? '',
          typeId,
          workflowId,
          stageId: stage.id,
          systemState: stage.systemState,
          stageOrder: keyBetween(null, first?.stageOrder ?? null),
          priority: body.priority ?? 'normal',
          deadline: body.deadline ? new Date(body.deadline) : null,
          plannedMinutes: body.plannedMinutes ?? null,
          acceptRequired: body.acceptRequired ?? false,
          creatorId: user.id,
          assigneeId,
          parentId: body.parentId ?? null,
          projectId: body.projectId ?? null,
          source: body.sourceMessageId ? 'chat_message' : 'manual',
          sourceId: body.sourceMessageId ?? null,
          checklistTotal: body.checklist?.length ?? 0,
          participants: { create: participants },
        },
      });
      await this.createChecklist(tx, task.id, body.checklist ?? []);
      await this.placements.sync(tx, task, holders, user.id);
      if (personalColumn?.systemState === task.systemState) {
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
    });
    return this.listItem(user.id, id);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.query.visibleRow(user, id);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canDelete) {
      throw DomainException.forbidden('Only creator can delete task');
    }
    await this.txRunner.run(async (tx) => {
      await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.task.updateMany({ where: { parentId: id }, data: { parentId: row.parentId } });
      await tx.taskPersonalPlacement.deleteMany({ where: { taskId: id } });
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.DELETED,
        { taskId: id, number: row.number, audience: audienceIds(row) },
        { actorId: user.id, aggregateType: 'task', aggregateId: id },
      );
    });
  }

  async listItem(viewerId: string, id: string, tx?: TransactionClient): Promise<TaskListItem> {
    const db = tx ?? this.prisma;
    const row = await db.task.findUniqueOrThrow({
      where: { id },
      include: taskListInclude(viewerId),
    });
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

  private async createChecklist(tx: TransactionClient, taskId: string, texts: string[]) {
    let prev: string | null = null;
    const data = texts.map((text) => {
      prev = keyBetween(prev, null);
      return { taskId, text, sortOrder: prev };
    });
    if (data.length > 0) await tx.taskChecklistItem.createMany({ data });
  }

  private async personalColumn(userId: string, stageId: string) {
    const column = await this.prisma.workflowStage.findFirst({
      where: { id: stageId, archivedAt: null, workflow: { kind: 'personal', ownerId: userId } },
    });
    if (!column) throw DomainException.notFound('Stage not found');
    return column;
  }

  async placeInColumn(tx: TransactionClient, taskId: string, userId: string, stageId: string) {
    await tx.taskPersonalPlacement.update({
      where: { taskId_userId: { taskId, userId } },
      data: { stageId, sortOrder: await this.placements.topKey(tx, userId, stageId) },
    });
  }

  /** Дедуп «В задачу»: одна живая задача на сообщение у постановщика
   *  (у другого сотрудника — своя; чужие задачи не раскрываются — без
   *  оракула существования). Индекс — частичный unique в миграции. */
  private async findBySource(user: AuthUser, messageId: string): Promise<TaskListItem | null> {
    const found = await this.prisma.task.findFirst({
      where: { source: 'chat_message', sourceId: messageId, creatorId: user.id, deletedAt: null },
      select: { id: true },
    });
    return found ? this.listItem(user.id, found.id) : null;
  }
}
