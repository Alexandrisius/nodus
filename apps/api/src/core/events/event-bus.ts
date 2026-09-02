import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import type { TransactionClient } from '../database/transaction-runner.js';

/** Опции публикации доменного события (payload минимальный — api-conventions.md). */
export interface EmitEventOptions {
  /** UUID инициатора; null — системное событие. */
  actorId?: string | null;
  /** Тип агрегата в ед. числе (`task`, `letter`). */
  aggregateType?: string;
  /** UUID агрегата. */
  aggregateId?: string;
  /** Минимальный payload (id + ключевые поля). */
  payload: Record<string, unknown>;
}

/**
 * Шина событий (канон — patterns.md): `emit(tx, 'module.action', {...})` —
 * outbox-запись в таблицу `events` в ТОЙ ЖЕ транзакции, что и изменение
 * сущности (I9). Самодельные публикации мимо outbox запрещены.
 * Доставку подписчикам выполняет `EventDispatcher`.
 */
@Injectable()
export class EventBus {
  async emit(tx: TransactionClient, type: string, options: EmitEventOptions): Promise<void> {
    await tx.event.create({
      data: {
        type,
        actorId: options.actorId ?? null,
        aggregateType: options.aggregateType ?? null,
        aggregateId: options.aggregateId ?? null,
        payload: options.payload as Prisma.InputJsonValue,
      },
    });
  }
}
