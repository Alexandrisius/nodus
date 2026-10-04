import { z } from 'zod';

import { notificationKindSchema, notificationPrioritySchema } from './notifications.schemas.js';

/**
 * Каталог доменных событий модуля notifications (I9). Payload клиентски
 * видим: тосты рисуются из snapshot без рефеча, список — рефеч (сервер —
 * истина). `notification.acked` удалена вместе с ack-механикой (ревизия
 * модели «важного» 05.10: подтверждение выпилено, повторы гасит прочтение).
 */
export const NOTIFICATION_EVENTS = {
  /** Единая точка входа диспетчера каналов: уведомление создано/повторено. */
  DISPATCH_REQUESTED: 'notification.dispatch_requested',
  /** Прочтение/гашение (вход в источник, прочтение одного, авто-архивация фона). */
  READ: 'notification.read',
} as const;

/** Снимок для тоста/бейджа: минимум полей, полный список — рефеч журнала. */
export const notificationSnapshotSchema = z.object({
  notificationId: z.uuid(),
  userId: z.uuid(),
  priority: notificationPrioritySchema,
  kind: notificationKindSchema,
  sourceId: z.uuid(),
  conversationId: z.uuid().nullable(),
  conversationTitle: z.string().nullable(),
  messageId: z.uuid().nullable(),
  threadRootId: z.uuid().nullable(),
  /** Короткое превью текста (null — без текста). */
  preview: z.string().nullable(),
  /** Имя актора для тоста (null — системное/повтор без имени). */
  actorName: z.string().nullable(),
});
export type NotificationSnapshot = z.infer<typeof notificationSnapshotSchema>;

/**
 * Уведомление готово к доставке (создание или повтор срочного): gateway
 * маршрутизирует в комнату `user:{userId}`; attempt > 0 — повтор срочного
 * (тост повторного напоминания, C2).
 */
export const notificationDispatchPayloadSchema = z.object({
  snapshot: notificationSnapshotSchema,
  /** 0 — первая доставка; 1..N — повторы срочного. */
  attempt: z.number().int().min(0),
  /** seq строки журнала (курсор дельты клиента). */
  seq: z.number().int().positive(),
});
export type NotificationDispatchPayload = z.infer<typeof notificationDispatchPayloadSchema>;

/** Гашение уведомлений пользователя (свои устройства: вкладки синхронны, D2). */
export const notificationReadPayloadSchema = z.object({
  userId: z.uuid(),
  /** Гашение по источнику (вход в чат) — id беседы; по id — прочтение. */
  sourceId: z.uuid().nullable(),
  notificationIds: z.array(z.uuid()).nullable(),
  readAt: z.iso.datetime(),
});
export type NotificationReadPayload = z.infer<typeof notificationReadPayloadSchema>;
