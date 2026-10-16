import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type TaskListItem,
  type TaskUpdateBody,
} from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, planHolderIds, taskAccess } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TransitionsService } from '../workflow/transitions.service.js';
import type { TaskListRow } from './task-row.js';
import { TasksQueryService } from './tasks-query.service.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

const FIELD_KEYS = [
  'title',
  'description',
  'priority',
  'deadline',
  'plannedMinutes',
  'acceptRequired',
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
    private readonly transitions: TransitionsService,
    private readonly placements: Placements,
  ) {}

  async update(user: AuthUser, id: string, body: TaskUpdateBody): Promise<TaskListItem> {
    const row = await this.query.visibleRow(user, id);
    const access = taskAccess(actorRoles(row, user.id), user.permissions);
    const fields = FIELD_KEYS.filter((k) => body[k] !== undefined);
    if (fields.length > 0 && !access.canEdit)
      throw DomainException.forbidden('Task edit not allowed');
    if (body.assigneeId) await this.tasks.assertActiveUsers([body.assigneeId]);
    if (body.parentId) await this.assertParent(user, id, body.parentId);
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
    await this.repo.lock(tx, row.id);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.plannedMinutes !== undefined) data.plannedMinutes = body.plannedMinutes;
    if (body.acceptRequired !== undefined) data.acceptRequired = body.acceptRequired;
    if (body.parentId !== undefined) data.parentId = body.parentId;
    if (body.deadline !== undefined) {
      data.deadline = body.deadline ? new Date(body.deadline) : null;
      data.overdueNotifiedAt = null; // новый срок — новое однократное уведомление
    }
    const reassigned = body.assigneeId !== undefined && body.assigneeId !== row.assigneeId;
    if (reassigned) {
      data.assigneeId = body.assigneeId;
      // Новый ответственный перестаёт быть соисполнителем/наблюдателем.
      await tx.taskParticipant.deleteMany({ where: { taskId: row.id, userId: body.assigneeId } });
    }
    await tx.task.update({ where: { id: row.id }, data });
    const after = await tx.task.findUniqueOrThrow({
      where: { id: row.id },
      include: { participants: true },
    });
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
    const current = await tx.task.findUniqueOrThrow({
      where: { id: row.id },
      select: { stageId: true },
    });
    if (current.stageId !== stageId) {
      await this.transitions.execute(tx, row.id, user, { stageId });
    } else if (!canEdit) {
      throw DomainException.forbidden('Reorder not allowed');
    }
    if (index !== undefined) {
      const stageOrder = await this.repo.stageKeyAt(tx, stageId, index, row.id);
      await tx.task.update({ where: { id: row.id }, data: { stageOrder } });
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
    const column = await tx.workflowStage.findFirst({
      where: { id: stageId, archivedAt: null, workflow: { kind: 'personal', ownerId: user.id } },
    });
    if (!column) throw DomainException.notFound('Stage not found');
    const placement = await tx.taskPersonalPlacement.findUnique({
      where: { taskId_userId: { taskId: row.id, userId: user.id } },
    });
    if (!placement) throw DomainException.notFound('Task is not in your plan');
    const task = await tx.task.findUniqueOrThrow({
      where: { id: row.id },
      select: { systemState: true },
    });
    if (task.systemState !== column.systemState) {
      await this.transitions.execute(tx, row.id, user, { systemState: column.systemState });
    }
    const sortOrder = await this.repo.personalKeyAt(tx, user.id, stageId, index ?? 0, row.id);
    await tx.taskPersonalPlacement.update({
      where: { taskId_userId: { taskId: row.id, userId: user.id } },
      data: { stageId, sortOrder },
    });
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.PERSONAL_STAGE_CHANGED,
      { taskId: row.id, userId: user.id, stageId, audience: [user.id] },
      { actorId: user.id, aggregateType: 'task', aggregateId: row.id },
    );
  }

  private async assertParent(user: AuthUser, id: string, parentId: string): Promise<void> {
    if (parentId === id)
      throw new DomainException(ErrorCode.TASK_PARENT_CYCLE, 'Task cannot be its own parent');
    await this.query.visibleRow(user, parentId);
    const cycle = await this.txRunner.run((tx) => this.repo.isDescendant(tx, id, parentId));
    if (cycle) throw new DomainException(ErrorCode.TASK_PARENT_CYCLE, 'Parent is a descendant');
  }
}
