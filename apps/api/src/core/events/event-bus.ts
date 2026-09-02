import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import type { TransactionClient } from '../database/transaction-runner.js';

/** Метаданные события (не часть payload). */
export interface EmitEventMeta {
  /** UUID инициатора; null — системное событие. */
  actorId?: string | null;
  /** Тип агрегата в ед. числе (`task`, `letter`). */
  aggregateType?: string;
  /** UUID агрегата. */
  aggregateId?: string;
}

/**
 * Шина событий (канон — patterns.md): `emit(tx, 'module.action', payload)` —
 * outbox-запись в таблицу `events` в ТОЙ ЖЕ транзакции, что и изменение
 * сущности (I9). Payload минимальный (id + ключевые поля — api-conventions.md).
 * Самодельные публикации мимо outbox запрещены.
 * Доставку подписчикам выполняет `EventDispatcher`.
 */
@Injectable()
export class EventBus {
  async emit(
    tx: TransactionClient,
    type: string,
    payload: Record<string, unknown>,
    meta: EmitEventMeta = {},
  ): Promise<void> {
    await tx.event.create({
      data: {
        type,
        actorId: meta.actorId ?? null,
        aggregateType: meta.aggregateType ?? null,
        aggregateId: meta.aggregateId ?? null,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
