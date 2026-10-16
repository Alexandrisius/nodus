import { Injectable } from '@nestjs/common';
import type { UrgentPolicy } from '@nodus/contracts';

import { MessagesWriteRepository } from './messages-write.repository.js';

/**
 * Состояние дневного лимита важных (#177) для счётчика в попапе молнии:
 * `GET /chat/urgent/policy`. Сутки скользящие (как в проверке send):
 * resetAt = старейшая отправка отправителя за 24ч + 24ч — момент возврата
 * лимита; null — исчерпания нет. Только чтение: резервирования лимита нет,
 * истина при отправке — 409 от send-urgent.policy (I8). Запросы — в
 * репозитории пути отправки (там же счётчик лимита send).
 */
@Injectable()
export class UrgentPolicyReader {
  constructor(private readonly writes: MessagesWriteRepository) {}

  async read(userId: string): Promise<UrgentPolicy> {
    const limit = Number(process.env.NOTIFY_URGENT_DAILY_LIMIT ?? 3);
    const groupMax = Number(process.env.NOTIFY_URGENT_GROUP_MAX ?? 20);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const sentToday = await this.writes.countUrgentSentSince(userId, since);
    if (sentToday < limit) {
      return { remaining: limit - sentToday, limit, resetAt: null, groupMax };
    }
    const oldest = await this.writes.findOldestUrgentSentSince(userId, since);
    return {
      remaining: 0,
      limit,
      resetAt: oldest !== null ? new Date(oldest.getTime() + 24 * 3600 * 1000).toISOString() : null,
      groupMax,
    };
  }
}
