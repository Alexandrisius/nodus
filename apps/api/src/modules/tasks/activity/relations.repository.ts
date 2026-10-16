import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

const ref = { select: { id: true, number: true, title: true } } as const;

/** Связи задач (`task_relations`): направленные пары (from → to, kind). */
@Injectable()
export class RelationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Исходящие связи задачи — только к задачам из where видимости. */
  listOutgoing(taskId: string, visible: Prisma.TaskWhereInput) {
    return this.prisma.taskRelation.findMany({
      where: { fromTaskId: taskId, toTask: visible },
      include: { toTask: ref },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Входящие связи задачи — только от задач из where видимости. */
  listIncoming(taskId: string, visible: Prisma.TaskWhereInput) {
    return this.prisma.taskRelation.findMany({
      where: { toTaskId: taskId, fromTask: visible },
      include: { fromTask: ref },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Связь есть или создаётся (повтор — без дубля, unique from/to/kind). */
  async ensure(
    tx: TransactionClient,
    r: { fromTaskId: string; toTaskId: string; kind: string; createdBy: string },
  ): Promise<void> {
    await tx.taskRelation.upsert({
      where: {
        fromTaskId_toTaskId_kind: { fromTaskId: r.fromTaskId, toTaskId: r.toTaskId, kind: r.kind },
      },
      update: {},
      create: r,
    });
  }

  /** Снять связь, касающуюся задачи (с любой стороны); снятая — или null. */
  async removeOfTask(
    tx: TransactionClient,
    relationId: string,
    taskId: string,
  ): Promise<{ fromTaskId: string; toTaskId: string } | null> {
    const where = { id: relationId, OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] };
    const found = await tx.taskRelation.findFirst({
      where,
      select: { fromTaskId: true, toTaskId: true },
    });
    if (!found) return null;
    const { count } = await tx.taskRelation.deleteMany({ where });
    return count > 0 ? found : null;
  }
}
