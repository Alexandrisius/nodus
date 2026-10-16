import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { keyBetween } from '../lib/fractional-index.js';
import type { TaskGateFacts } from '../workflow/transition-rules.js';
import { taskListInclude, type TaskListRow } from './task-row.js';

const OPEN_STATES = ['backlog', 'active', 'paused'];

/** Порядок выдачи списка: колонка глобальной оси, личной оси или номер. */
export type TaskOrder =
  | { kind: 'stage'; after?: { o: string; id: string } }
  | { kind: 'personal'; userId: string; stageId: string; after?: { o: string; id: string } }
  | { kind: 'number'; after?: { n: number } };

/** Задачи: чтения через where видимости (task-visibility), записи — в tx сервиса. */
@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(where: Prisma.TaskWhereInput, viewerId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).task.findFirst({ where, include: taskListInclude(viewerId) });
  }

  /** Блокировка строки задачи на время транзакции (сериализация переходов). */
  async lock(tx: TransactionClient, taskId: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
  }

  async list(
    where: Prisma.TaskWhereInput,
    order: TaskOrder,
    limit: number,
    viewerId: string,
  ): Promise<{ rows: TaskListRow[]; sortKeys: Map<string, string> }> {
    const include = taskListInclude(viewerId);
    if (order.kind === 'personal') {
      const a = order.after;
      const placements = await this.prisma.taskPersonalPlacement.findMany({
        where: {
          userId: order.userId,
          stageId: order.stageId,
          task: where,
          ...(a
            ? { OR: [{ sortOrder: { gt: a.o } }, { sortOrder: a.o, taskId: { gt: a.id } }] }
            : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { taskId: 'asc' }],
        take: limit + 1,
        include: { task: { include } },
      });
      return {
        rows: placements.map((p) => p.task),
        sortKeys: new Map(placements.map((p) => [p.taskId, p.sortOrder])),
      };
    }
    if (order.kind === 'stage') {
      const a = order.after;
      const rows = await this.prisma.task.findMany({
        where: a
          ? {
              AND: [
                where,
                { OR: [{ stageOrder: { gt: a.o } }, { stageOrder: a.o, id: { gt: a.id } }] },
              ],
            }
          : where,
        orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        include,
      });
      return { rows, sortKeys: new Map(rows.map((r) => [r.id, r.stageOrder])) };
    }
    const rows = await this.prisma.task.findMany({
      where: order.after ? { AND: [where, { number: { lt: order.after.n } }] } : where,
      orderBy: { number: 'desc' },
      take: limit + 1,
      include,
    });
    return { rows, sortKeys: new Map() };
  }

  async gateFacts(taskId: string, tx: TransactionClient): Promise<TaskGateFacts> {
    const [task, openSubtasks, result] = await Promise.all([
      tx.task.findUniqueOrThrow({ where: { id: taskId } }),
      tx.task.count({
        where: { parentId: taskId, deletedAt: null, systemState: { in: OPEN_STATES } },
      }),
      tx.taskResult.findFirst({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
        select: { text: true },
      }),
    ]);
    return {
      stageId: task.stageId,
      acceptRequired: task.acceptRequired,
      openSubtasks,
      checklistDone: task.checklistDone,
      checklistTotal: task.checklistTotal,
      spentMinutes: task.spentMinutes,
      description: task.description,
      deadline: task.deadline,
      assigneeId: task.assigneeId,
      plannedMinutes: task.plannedMinutes,
      hasResult: Boolean(result?.text.trim()),
    };
  }

  /** Ключ порядка для позиции index в колонке глобальной оси (без самой задачи). */
  async stageKeyAt(
    tx: TransactionClient,
    stageId: string,
    index: number | undefined,
    exceptId?: string,
  ) {
    const where = { stageId, ...(exceptId ? { id: { not: exceptId } } : {}) };
    if (index === undefined || index === 0) {
      const first = await tx.task.findFirst({
        where,
        orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
      });
      return keyBetween(null, first?.stageOrder ?? null);
    }
    const near = await tx.task.findMany({
      where,
      orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
      skip: index - 1,
      take: 2,
      select: { stageOrder: true },
    });
    return keyBetween(near[0]?.stageOrder ?? null, near[1]?.stageOrder ?? null);
  }

  /** То же для личной колонки пользователя. */
  async personalKeyAt(
    tx: TransactionClient,
    userId: string,
    stageId: string,
    index: number,
    exceptTaskId: string,
  ) {
    const near = await tx.taskPersonalPlacement.findMany({
      where: { userId, stageId, taskId: { not: exceptTaskId } },
      orderBy: [{ sortOrder: 'asc' }, { taskId: 'asc' }],
      skip: Math.max(index - 1, 0),
      take: index === 0 ? 1 : 2,
      select: { sortOrder: true },
    });
    return index === 0
      ? keyBetween(null, near[0]?.sortOrder ?? null)
      : keyBetween(near[0]?.sortOrder ?? null, near[1]?.sortOrder ?? null);
  }

  /** Счётчики колонок глобальной оси (count + overdue) в рамках видимости. */
  async stageCounts(where: Prisma.TaskWhereInput, now: Date) {
    const [all, overdue] = await Promise.all([
      this.prisma.task.groupBy({ by: ['stageId'], where, _count: { _all: true } }),
      this.prisma.task.groupBy({
        by: ['stageId'],
        where: { AND: [where, { deadline: { lt: now }, systemState: { in: OPEN_STATES } }] },
        _count: { _all: true },
      }),
    ]);
    return { all, overdue };
  }

  async personalCounts(userId: string, where: Prisma.TaskWhereInput, now: Date) {
    const [all, overdue] = await Promise.all([
      this.prisma.taskPersonalPlacement.groupBy({
        by: ['stageId'],
        where: { userId, task: where },
        _count: { _all: true },
      }),
      this.prisma.taskPersonalPlacement.groupBy({
        by: ['stageId'],
        where: {
          userId,
          task: { AND: [where, { deadline: { lt: now }, systemState: { in: OPEN_STATES } }] },
        },
        _count: { _all: true },
      }),
    ]);
    return { all, overdue };
  }

  /** Предок ли candidate задачи taskId (защита от цикла родителя). */
  async isDescendant(
    tx: TransactionClient,
    ancestorId: string,
    candidateId: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE sub AS (
        SELECT id FROM tasks WHERE parent_id = ${ancestorId}::uuid
        UNION SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id
      ) SELECT id FROM sub WHERE id = ${candidateId}::uuid LIMIT 1`);
    return rows.length > 0;
  }
}
