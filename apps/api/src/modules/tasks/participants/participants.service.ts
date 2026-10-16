import { Injectable } from '@nestjs/common';
import {
  TASK_EVENTS,
  type AuthUser,
  type TaskDetail,
  type TaskParticipantAddBody,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, planHolderIds, taskAccess } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksService } from '../tasks/tasks.service.js';

/**
 * Соисполнители и наблюдатели (мини-спека #37): менять — постановщик,
 * ответственный, task.manage_any; наблюдатель снимает себя сам. Новый
 * наблюдатель — без звука. Состав чата задачи синхронизирует модуль chat по
 * событию task.participants_changed (#252).
 */
@Injectable()
export class ParticipantsService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly placements: Placements,
    private readonly query: TasksQueryService,
    private readonly tasks: TasksService,
  ) {}

  async add(user: AuthUser, taskId: string, body: TaskParticipantAddBody): Promise<TaskDetail> {
    const row = await this.query.visibleRow(user, taskId);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canManageParticipants) {
      throw DomainException.forbidden('Participants change not allowed');
    }
    if (body.userId === row.assigneeId) {
      throw DomainException.conflict('Assignee is already on the task');
    }
    await this.tasks.assertActiveUsers([body.userId]);
    await this.placements.prepare([body.userId]);
    await this.txRunner.run(async (tx) => {
      await tx.taskParticipant.upsert({
        where: { taskId_userId: { taskId, userId: body.userId } },
        update: { role: body.role },
        create: { taskId, userId: body.userId, role: body.role, muted: body.role === 'observer' },
      });
      await this.afterChange(tx, user.id, taskId, [{ userId: body.userId, role: body.role }], []);
    });
    return this.query.detail(user, taskId);
  }

  async remove(user: AuthUser, taskId: string, userId: string): Promise<TaskDetail | null> {
    const row = await this.query.visibleRow(user, taskId);
    const self = userId === user.id;
    if (!self && !taskAccess(actorRoles(row, user.id), user.permissions).canManageParticipants) {
      throw DomainException.forbidden('Participants change not allowed');
    }
    await this.txRunner.run(async (tx) => {
      const { count } = await tx.taskParticipant.deleteMany({ where: { taskId, userId } });
      if (count > 0) await this.afterChange(tx, user.id, taskId, [], [userId]);
    });
    // Снявший себя наблюдатель может потерять видимость — тогда ответ пустой.
    return this.query.detail(user, taskId).catch(() => null);
  }

  private async afterChange(
    tx: TransactionClient,
    actorId: string,
    taskId: string,
    added: { userId: string; role: string }[],
    removed: string[],
  ): Promise<void> {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { participants: true },
    });
    await this.placements.sync(tx, task, planHolderIds(task), actorId);
    await tx.task.update({ where: { id: taskId }, data: { updatedAt: new Date() } });
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.PARTICIPANTS_CHANGED,
      {
        taskId,
        number: task.number,
        audience: audienceIds(task, removed),
        title: task.title,
        added,
        removed,
      },
      { actorId, aggregateType: 'task', aggregateId: taskId },
    );
  }
}
