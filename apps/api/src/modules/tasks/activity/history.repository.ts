import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';

/**
 * История задачи — чтение event log (`events`, I9) по агрегату задачи.
 * Таблица — outbox core (пишет только EventBus); модуль её только читает
 * по своему агрегату `task`.
 */
@Injectable()
export class HistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** События task.* агрегата (кроме исключённых типов), свежие первыми; keyset seq. */
  pageTaskEvents(
    taskId: string,
    excludeTypes: readonly string[],
    before: bigint | undefined,
    limit: number,
  ) {
    return this.prisma.event.findMany({
      where: {
        aggregateType: 'task',
        aggregateId: taskId,
        type: { startsWith: 'task.', notIn: [...excludeTypes] },
        ...(before !== undefined ? { seq: { lt: before } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });
  }
}
