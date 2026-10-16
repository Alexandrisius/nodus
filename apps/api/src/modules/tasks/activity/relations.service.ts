import { Injectable } from '@nestjs/common';
import {
  TASK_EVENTS,
  type AuthUser,
  type Paginated,
  type TaskRelation,
  type TaskRelationCreateBody,
  type TaskRelationKind,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, taskAccess } from '../access/task-access.js';
import { visibleTasksWhere } from '../access/task-visibility.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { RelationsRepository } from './relations.repository.js';

interface RosterRow {
  id: string;
  number: number;
  creatorId: string;
  assigneeId: string;
  participants: { userId: string; role: string }[];
}

/** Связи задач: видны только связи с задачами, видимыми смотрящему. Связь
 *  меняет ОБЕ карточки — task.relation_changed уходит по каждой стороне
 *  (своя аудитория, своя история). */
@Injectable()
export class RelationsService {
  constructor(
    private readonly repo: RelationsRepository,
    private readonly tasksRepo: TasksRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly query: TasksQueryService,
  ) {}

  async list(user: AuthUser, taskId: string): Promise<Paginated<TaskRelation>> {
    await this.query.visibleRow(user, taskId);
    const visible = visibleTasksWhere(await this.query.viewer(user), 'all');
    const [out, inc] = await Promise.all([
      this.repo.listOutgoing(taskId, visible),
      this.repo.listIncoming(taskId, visible),
    ]);
    return {
      items: [
        ...out.map((r) => ({
          id: r.id,
          kind: r.kind as TaskRelationKind,
          task: r.toTask,
          direction: 'out' as const,
        })),
        ...inc.map((r) => ({
          id: r.id,
          kind: r.kind as TaskRelationKind,
          task: r.fromTask,
          direction: 'in' as const,
        })),
      ],
      nextCursor: null,
    };
  }

  async add(
    user: AuthUser,
    taskId: string,
    body: TaskRelationCreateBody,
  ): Promise<Paginated<TaskRelation>> {
    const row = await this.query.visibleRow(user, taskId);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canEdit) {
      throw DomainException.forbidden('Relation change not allowed');
    }
    if (body.toTaskId === taskId) throw DomainException.conflict('Task cannot relate to itself');
    const other = await this.query.visibleRow(user, body.toTaskId);
    await this.txRunner.run(async (tx) => {
      await this.repo.ensure(tx, {
        fromTaskId: taskId,
        toTaskId: body.toTaskId,
        kind: body.kind,
        createdBy: user.id,
      });
      await this.emit(tx, user.id, row);
      await this.emit(tx, user.id, other);
    });
    return this.list(user, taskId);
  }

  async remove(user: AuthUser, taskId: string, relationId: string): Promise<void> {
    const row = await this.query.visibleRow(user, taskId);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canEdit) {
      throw DomainException.forbidden('Relation change not allowed');
    }
    await this.txRunner.run(async (tx) => {
      const removed = await this.repo.removeOfTask(tx, relationId, taskId);
      if (!removed) throw DomainException.notFound('Relation not found');
      await this.emit(tx, user.id, row);
      const otherId = removed.fromTaskId === taskId ? removed.toTaskId : removed.fromTaskId;
      // Вторая сторона могла быть удалена (мягко) — её карточку не обновлять.
      const other = await this.tasksRepo.findLiveRoster(otherId, tx);
      if (other) await this.emit(tx, user.id, other);
    });
  }

  private emit(tx: TransactionClient, actorId: string, row: RosterRow) {
    return this.eventBus.emit(
      tx,
      TASK_EVENTS.RELATION_CHANGED,
      { taskId: row.id, number: row.number, audience: audienceIds(row) },
      { actorId, aggregateType: 'task', aggregateId: row.id },
    );
  }
}
