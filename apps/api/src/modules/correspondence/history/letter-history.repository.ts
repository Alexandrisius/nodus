import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';

/**
 * История письма — чтение event log (`events`, I9) по агрегату `letter`
 * (#55, Р11). Таблица — outbox core: пишет только EventBus, модуль читает
 * свои события (образец — история задач).
 */
@Injectable()
export class LetterHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  page(letterId: string, before: bigint | undefined, limit: number) {
    return this.prisma.event.findMany({
      where: {
        aggregateType: 'letter',
        aggregateId: letterId,
        type: { startsWith: 'correspondence.' },
        ...(before !== undefined ? { seq: { lt: before } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });
  }
}
