import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/** Ревизии результата задачи (`task_results`, append-only; текущий — последний). */
@Injectable()
export class ResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Последние ревизии, свежие первыми. */
  listRecent(taskId: string, limit: number) {
    return this.prisma.taskResult.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  /** Текущий результат (последняя ревизия) или null. */
  findCurrent(taskId: string) {
    return this.prisma.taskResult.findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } });
  }

  create(
    tx: TransactionClient,
    data: { taskId: string; text: string; messageIds: string[]; authorId: string },
  ) {
    return tx.taskResult.create({
      data: { ...data, messageIds: data.messageIds as Prisma.InputJsonValue },
    });
  }
}
