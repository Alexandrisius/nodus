import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import type { UrgentPolicy } from '@nodus/contracts';

import { PrismaService } from '../../../core/database/prisma.service.js';
import { MessagesRepository } from './messages.repository.js';

/**
 * Состояние дневного лимита важных (#177) для счётчика в попапе молнии:
 * `GET /chat/urgent/policy`. Сутки скользящие (как в проверке send):
 * resetAt = старейшая отправка отправителя за 24ч + 24ч — момент возврата
 * лимита; null — исчерпания нет. Только чтение: резервирования лимита нет,
 * истина при отправке — 409 от send-urgent.policy (I8).
 */
@Injectable()
export class UrgentPolicyReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesRepository,
  ) {}

  async read(userId: string): Promise<UrgentPolicy> {
    const limit = Number(process.env.NOTIFY_URGENT_DAILY_LIMIT ?? 3);
    const groupMax = Number(process.env.NOTIFY_URGENT_GROUP_MAX ?? 20);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const sentToday = await this.messages.countUrgentSentSince(userId, since);
    if (sentToday < limit) {
      return { remaining: limit - sentToday, limit, resetAt: null, groupMax };
    }
    const oldest = await this.oldestUrgentSentSince(userId, since);
    return {
      remaining: 0,
      limit,
      resetAt: oldest !== null ? new Date(oldest.getTime() + 24 * 3600 * 1000).toISOString() : null,
      groupMax,
    };
  }

  private async oldestUrgentSentSince(userId: string, since: Date): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<{ oldest: Date | null }[]>(Prisma.sql`
      SELECT min(created_at) AS oldest FROM messages
      WHERE author_id = ${userId}::uuid AND urgent AND created_at >= ${since}::timestamptz
    `);
    return rows[0]?.oldest ?? null;
  }
}
