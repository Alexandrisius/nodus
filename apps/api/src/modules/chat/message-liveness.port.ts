/**
 * Read-порт живости сообщений (ADR-0012, #267): модуль notifications строит
 * pack-time фильтр «уведомления об удалённых сообщениях не отдаются» (гонка
 * порядка событий outbox: message_sent обработан после message_deleted), не
 * трогая таблицы чата (I3/I6). Владелец данных — chat: реализация
 * `message-liveness.provider.ts`, знание схемы messages (мягкое удаление
 * deleted_at) живёт у владельца и не утекает потребителю; потребитель
 * передаёт своё SQL-выражение ссылки (колонку журнала), порт возвращает
 * композируемый предикат для параметризованных запросов.
 */

import { Prisma } from '../../generated/prisma/client.js';

export const CHAT_MESSAGE_LIVENESS = Symbol('CHAT_MESSAGE_LIVENESS');

export interface ChatMessageLiveness {
  /** Предикат «сообщение по ссылке живо» (анти-join NOT EXISTS): ref —
   *  SQL-фрагмент ссылки потребителя (например, колонка его таблицы);
   *  безисточниковые NULL-ссылки проходят как живые. */
  messageAliveGuard(ref: Prisma.Sql): Prisma.Sql;
}
