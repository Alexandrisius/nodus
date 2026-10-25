import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type TaskListItem,
  type TaskUpdateBody,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  WORKFLOW_ENGINE,
  type WorkflowEnginePort,
} from '../../workflows/ports/workflow-engine.port.js';
import { actorRoles, audienceIds, planHolderIds, taskAccess } from '../access/task-access.js';
import { ParticipantsRepository } from '../participants/participants.repository.js';
import { PersonalBoardsRepository } from '../personal/personal-boards.repository.js';
import { Placements } from '../personal/placements.js';
import { PlacementsRepository } from '../personal/placements.repository.js';
import type { TaskListRow } from './task-row.js';
import { TasksQueryService } from './tasks-query.service.js';
import { TasksRepository, type TaskFieldsPatch } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

const FIELD_KEYS = [
  'title',
  'description',
  'priority',
  'deadline',
  'plannedMinutes',
  'assigneeId',
  'parentId',
] as const;

/**
 * PATCH задачи: перенос по обеим осям (глобальная — переход маршрута,
 * личная — колонка «Моего плана», другая колонка состояния = переход) и
 * правка полей. Правка — постановщик/ответственный/task.manage_any.
 */
@Injectable()
export class TaskEditService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly repo: TasksRepository,
    private readonly query: TasksQueryService,
    private readonly tasks: TasksService,
    private readonly placements: Placements,
    private readonly placementsRepo: PlacementsRepository,
    private readonly participantsRepo: ParticipantsRepository,
    private readonly boards: PersonalBoardsRepository,
    @Inject(WORKFLOW_ENGINE) private readonly engine: WorkflowEnginePort,
  ) {}

  async update(user: AuthUser, id: string, body: TaskUpdateBody): Promise<TaskListItem> {
    const row = await this.query.visibleRow(user, id);
    const access = taskAccess(actorRoles(row, user.id), user.permissions);
    const fields = FIELD_KEYS.filter((k) => body[k] !== undefined);
    if (fields.length > 0 && !access.canEdit)
      throw DomainException.forbidden('Task edit not allowed');
    if (body.assigneeId) await this.tasks.assertActiveUsers([body.assigneeId]);
    if (body.parentId === id) {
      throw new DomainException(ErrorCode.TASK_PARENT_CYCLE, 'Task cannot be its own parent');
    }
    if (body.parentId !== undefined && body.parentId !== row.parentId) {
      // Перепривязка трогает ОБА конца: новый родитель получает подзадачу,
      // прежний — теряет (иначе отвязка обходила бы его гейт «нет открытых
      // подзадач»). Права правки нужны на обоих (security-гейт #37, р.2).
      if (body.parentId) await this.tasks.assertCanEditParent(user, body.parentId);
      if (row.parentId) await this.tasks.assertCanEditParent(user, row.parentId);
    }
    const holdersAfter = planHolderIds({ ...row, assigneeId: body.assigneeId ?? row.assigneeId });
    await this.placements.prepare(holdersAfter);

    await this.txRunner.run(async (tx) => {
      if (fields.length > 0) await this.applyFields(tx, user, row, body, fields);
      if (body.stageId)
        await this.moveGlobal(tx, user, row, body.stageId, body.index, access.canEdit);
      if (body.personalStageId)
        await this.movePersonal(tx, user, row, body.personalStageId, body.index);
    });
    return this.tasks.listItem(user.id, id);
  }

  private async applyFields(
    tx: TransactionClient,
    user: AuthUser,
    row: TaskListRow,
    body: TaskUpdateBody,
    fields: readonly string[],
  ): Promise<void> {
    const reparent = body.parentId !== undefined;
    // Смены родителя сериализуются одной advisory-блокировкой транзакции
    // (построчные локи не ловят циклы из 4+ узлов) — и берётся она ДО замка
    // строки: единый порядок захвата во всех транзакциях, без 40P01 с
    // FK-проверкой parent_id (security-гейт #37, р.2–3). Смены редки.
    if (reparent) await this.repo.lockTree(tx);
    await this.repo.lock(tx, row.id);
    if (reparent) {
      // Права на прежнего родителя проверены по снимку до транзакции —
      // параллельная перепривязка их обесценивает: конфликт, а не обход.
      const freshParentId = await this.repo.parentIdOf(tx, row.id);
      if (freshParentId !== row.parentId) {
        throw DomainException.conflict('Task parent changed concurrently');
      }
    }
    if (body.parentId) {
      if (await this.repo.isDescendant(tx, row.id, body.parentId)) {
        throw new DomainException(ErrorCode.TASK_PARENT_CYCLE, 'Parent is a descendant');
      }
    }
    const data: TaskFieldsPatch = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.plannedMinutes !== undefined) data.plannedMinutes = body.plannedMinutes;
    if (body.parentId !== undefined) data.parentId = body.parentId;
    if (body.deadline !== undefined) {
      data.deadline = body.deadline ? new Date(body.deadline) : null;
      data.overdueNotifiedAt = null; // новый срок — новое однократное уведомление
    }
    const newAssigneeId = body.assigneeId !== row.assigneeId ? body.assigneeId : undefined;
    const reassigned = newAssigneeId !== undefined;
    if (newAssigneeId !== undefined) {
      data.assigneeId = newAssigneeId;
      // Новый ответственный перестаёт быть соисполнителем/наблюдателем.
      await this.participantsRepo.remove(tx, row.id, newAssigneeId);
    }
    await this.repo.updateFields(tx, row.id, data);
    const after = await this.repo.findWithParticipants(row.id, tx);
    const base = {
      taskId: row.id,
      number: row.number,
      audience: audienceIds(after, [row.assigneeId]),
    };
    const meta = { actorId: user.id, aggregateType: 'task', aggregateId: row.id };
    if (reassigned) {
      await this.placements.sync(tx, after, planHolderIds(after), user.id);
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.ASSIGNED,
        {
          ...base,
          title: after.title,
          assigneeId: after.assigneeId,
          previousAssigneeId: row.assigneeId,
        },
        meta,
      );
    }
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.UPDATED,
      {
        ...base,
        fields,
        ...(body.title !== undefined ? { title: after.title } : {}),
        ...(body.deadline !== undefined ? { deadline: after.deadline?.toISOString() ?? null } : {}),
      },
      meta,
    );
  }

  private async moveGlobal(
    tx: TransactionClient,
    user: AuthUser,
    row: TaskListRow,
    stageId: string,
    index: number | undefined,
    canEdit: boolean,
  ): Promise<void> {
    const currentStageId = await this.repo.stageIdOf(tx, row.id);
    if (currentStageId !== stageId) {
      await this.engine.execute(tx, row.id, 'task', user, { stageId });
    } else if (!canEdit) {
      throw DomainException.forbidden('Reorder not allowed');
    }
    if (index !== undefined) {
      const stageOrder = await this.repo.stageKeyAt(tx, stageId, index, row.id);
      await this.repo.setStageOrder(tx, row.id, stageOrder);
    }
  }

  /** Колонка «Моего плана»: только держатель плана; колонка другого
   *  состояния — переход маршрута в стадию этого состояния. */
  private async movePersonal(
    tx: TransactionClient,
    user: AuthUser,
    row: TaskListRow,
    stageId: string,
    index: number | undefined,
  ): Promise<void> {
    const column = await this.boards.findColumn(user.id, stageId, tx);
    if (!column) throw DomainException.notFound('Stage not found');
    const placement = await this.placementsRepo.findOne(tx, row.id, user.id);
    if (!placement) throw DomainException.notFound('Task is not in your plan');
    const systemState = await this.repo.systemStateOf(tx, row.id);
    if (systemState !== column.systemState) {
      await this.engine.execute(tx, row.id, 'task', user, { systemState: column.systemState });
    }
    const sortOrder = await this.placementsRepo.keyAt(tx, user.id, stageId, index ?? 0, row.id);
    await this.placementsRepo.move(tx, { taskId: row.id, userId: user.id, stageId, sortOrder });
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.PERSONAL_STAGE_CHANGED,
      { taskId: row.id, userId: user.id, stageId, audience: [user.id] },
      { actorId: user.id, aggregateType: 'task', aggregateId: row.id },
    );
  }
}
