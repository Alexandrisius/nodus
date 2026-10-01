import { z } from 'zod';

import { notificationKindSchema, notificationTierSchema } from './notifications.schemas.js';

/**
 * Каталог доменных событий модуля notifications (I9; расширение каталога —
 * `notification.dispatch_requested`/`read` существовали с нулевой редакции,
 * `notification.acked` добавлена #100). Payload клиентски видим: тосты
 * рисуются из snapshot без рефеча, список — рефеч (сервер — истина).
 */
export const NOTIFICATION_EVENTS = {
  /** Единая точка входа диспетчера каналов: уведомление создано/повторено. */
  DISPATCH_REQUESTED: 'notification.dispatch_requested',
  /** Прочтение/гашение (вход в источник, прочтение одного, авто-архивация фона). */
  READ: 'notification.read',
  /** Ознакомление с срочным ( будит отправителя: «Ознакомились N из M»). */
  ACKED: 'notification.acked',
} as const;

/** Снимок для тоста/бейджа: минимум полей, полный список — рефеч журнала. */
export const notificationSnapshotSchema = z.object({
  notificationId: z.uuid(),
  userId: z.uuid(),
  tier: notificationTierSchema,
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
  /** Гашение по источнику (вход в чат) — id беседы; по id — прочтение/ack. */
  sourceId: z.uuid().nullable(),
  notificationIds: z.array(z.uuid()).nullable(),
  readAt: z.iso.datetime(),
});
export type NotificationReadPayload = z.infer<typeof notificationReadPayloadSchema>;

/** Кто-то ознакомился со срочным — будило отправителю (реальный time, C9). */
export const notificationAckedPayloadSchema = z.object({
  /** Будило адресовано отправителю срочного. */
  userId: z.uuid(),
  messageId: z.uuid(),
  ackedCount: z.number().int().min(0),
  expectedCount: z.number().int().min(0),
  ackedAt: z.iso.datetime(),
});
export type NotificationAckedPayload = z.infer<typeof notificationAckedPayloadSchema>;
