import { Injectable } from '@nestjs/common';
import {
  TASK_EVENTS,
  type AuthUser,
  type Paginated,
  type TaskRelation,
  type TaskRelationCreateBody,
  type TaskRelationKind,
} from '@nodus/contracts';

import { PrismaService } from '../../../core/database/prisma.service.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, taskAccess } from '../access/task-access.js';
import { visibleTasksWhere } from '../access/task-visibility.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';

const ref = { select: { id: true, number: true, title: true } } as const;

/** Связи задач: видны только связи с задачами, видимыми смотрящему. */
@Injectable()
export class RelationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly query: TasksQueryService,
  ) {}

  async list(user: AuthUser, taskId: string): Promise<Paginated<TaskRelation>> {
    await this.query.visibleRow(user, taskId);
    const visible = visibleTasksWhere(await this.query.viewer(user), 'all');
    const [out, inc] = await Promise.all([
      this.prisma.taskRelation.findMany({
        where: { fromTaskId: taskId, toTask: visible },
        include: { toTask: ref },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.taskRelation.findMany({
        where: { toTaskId: taskId, fromTask: visible },
        include: { fromTask: ref },
        orderBy: { createdAt: 'asc' },
      }),
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
    await this.query.visibleRow(user, body.toTaskId);
    await this.txRunner.run(async (tx) => {
      await tx.taskRelation.upsert({
        where: {
          fromTaskId_toTaskId_kind: {
            fromTaskId: taskId,
            toTaskId: body.toTaskId,
            kind: body.kind,
          },
        },
        update: {},
        create: {
          fromTaskId: taskId,
          toTaskId: body.toTaskId,
          kind: body.kind,
          createdBy: user.id,
        },
      });
      await this.emit(tx, user.id, row);
    });
    return this.list(user, taskId);
  }

  async remove(user: AuthUser, taskId: string, relationId: string): Promise<void> {
    const row = await this.query.visibleRow(user, taskId);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canEdit) {
      throw DomainException.forbidden('Relation change not allowed');
    }
    await this.txRunner.run(async (tx) => {
      const { count } = await tx.taskRelation.deleteMany({
        where: { id: relationId, OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] },
      });
      if (count === 0) throw DomainException.notFound('Relation not found');
      await this.emit(tx, user.id, row);
    });
  }

  private emit(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    actorId: string,
    row: {
      id: string;
      number: number;
      creatorId: string;
      assigneeId: string;
      participants: { userId: string; role: string }[];
    },
  ) {
    return this.eventBus.emit(
      tx,
      TASK_EVENTS.RELATION_CHANGED,
      { taskId: row.id, number: row.number, audience: audienceIds(row) },
      { actorId, aggregateType: 'task', aggregateId: row.id },
    );
  }
}
