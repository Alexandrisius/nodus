import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/**
 * Контракты модуля notifications (#100, ADR-0016): журнал уведомлений —
 * источник истины; ярусы urgent/personal/action/background; ознакомление
 * (ack) только для срочных. Русские строки UI — по `kind` из i18n (I15),
 * сервер лингвистики не несёт.
 */

/** Ярус внимания: иерархия блоков Главной = иерархия ярусов (вердикт 30.09). */
export const notificationTierSchema = z.enum(['urgent', 'personal', 'action', 'background']);
export type NotificationTier = z.infer<typeof notificationTierSchema>;

/**
 * Тип источника уведомления. kind — механика «что случилось» (заголовок
 * строки из i18n), sourceType/sourceId — «где» (переход по клику).
 * `chat.thread_reply`/`chat.channel_post`/`chat.direct_message`/`chat.mention`
 * — живые источники ночи; `action.*` — заделы под поручения/согласования
 * (H3: на моках, бэк-источники появятся с модулями).
 */
export const notificationKindSchema = z.enum([
  'urgent.message',
  'chat.direct_message',
  'chat.mention',
  'chat.thread_reply',
  'chat.channel_post',
  'action.assignment',
  'action.approval',
  'action.deadline',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSourceSchema = z.enum([
  'conversation',
  'message',
  'task',
  'letter',
  'workflow',
]);
export type NotificationSource = z.infer<typeof notificationSourceSchema>;

/** Строка журнала уведомлений (единая выдача ленты Главной, колокольчика и дельты). */
export const notificationSchema = z.object({
  id: z.uuid(),
  /** Глобальный порядок журнала (bigserial): курсор дельты после reconnect. */
  seq: z.number().int().positive(),
  tier: notificationTierSchema,
  kind: notificationKindSchema,
  sourceType: notificationSourceSchema,
  sourceId: z.uuid(),
  /** Кто породил (автор сообщения); null — системное. */
  actor: userRefSchema.nullable(),
  /** Превью текста (выжимка «что»); null — без текста. */
  preview: z.string().nullable(),
  /** Полный текст срочного — тело «листа ознакомления» (только urgent). */
  urgentText: z.string().nullable(),
  conversationId: z.uuid().nullable(),
  /** Название беседы («где»); у direct — null, строка покажет автора. */
  conversationTitle: z.string().nullable(),
  messageId: z.uuid().nullable(),
  threadRootId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
  /** Ознакомление (СЭД-паттерн): только urgent, отдельный от readAt акт. */
  ackAt: z.iso.datetime().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Сводка для индикации «число + точка» (колокольчик, рейка, document.title). */
export const notificationSummarySchema = z.object({
  /** Непрочитанные важные (urgent+personal+action) — ЧИСЛО. */
  attention: z.number().int().min(0),
  urgent: z.number().int().min(0),
  personal: z.number().int().min(0),
  action: z.number().int().min(0),
  /** Непрочитанный фон — ТОЧКА без числа (cap отображения «999+» — клиент). */
  background: z.number().int().min(0),
});
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;

/** Фильтры ленты: пилюли Главной + развёрнутый фон + «Все» (история журнала). */
export const notificationFilterSchema = z.enum([
  'attention',
  'unread',
  'mentions',
  'actions',
  'background',
  'all',
]);
export type NotificationFilter = z.infer<typeof notificationFilterSchema>;

export const listNotificationsQuerySchema = cursorQuerySchema.extend({
  filter: notificationFilterSchema.default('attention'),
  /** Подстрока по превью (поиск Главной). */
  q: z.string().trim().max(200).optional(),
  /** Дельта после reconnect: только записи журнала с seq > afterSeq. */
  afterSeq: z.number().int().nonnegative().optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/** Ответ списка — канон `{ items, nextCursor }` (I7). */
export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  /** Курсор дельты (max seq страницы) — клиент хранит для afterSeq. */
  lastSeq: z.number().int().nonnegative(),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

/** Строка списка ознакомившихся с срочным (отправитель, C8/C9). */
export const urgentAckEntrySchema = z.object({
  user: userRefSchema,
  ackedAt: z.iso.datetime(),
});
export type UrgentAckEntry = z.infer<typeof urgentAckEntrySchema>;

/** «Ознакомились N из M» по срочному сообщению (аналитика журнала). */
export const urgentAckStatusSchema = z.object({
  messageId: z.uuid(),
  ackedCount: z.number().int().min(0),
  expectedCount: z.number().int().min(0),
  items: z.array(urgentAckEntrySchema),
});
export type UrgentAckStatus = z.infer<typeof urgentAckStatusSchema>;

/** Настройки уведомлений пользователя (DND-расписание; тосты гасятся, кроме urgent). */
export const notificationSettingsSchema = z.object({
  dndEnabled: z.boolean(),
  /** Начало/конец окна «не беспокоить», локальное «HH:mm». */
  dndStart: z.string().regex(/^\d{2}:\d{2}$/),
  dndEnd: z.string().regex(/^\d{2}:\d{2}$/),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsBodySchema = notificationSettingsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field required' });
export type UpdateNotificationSettingsBody = z.infer<typeof updateNotificationSettingsBodySchema>;

/** Запись журнала доставок одного уведомления (D6: когда и каким каналом). */
export const notificationDeliverySchema = z.object({
  channel: z.enum(['ws', 'repeat']),
  /** Попытка повтора (channel='repeat': 1..N); ws — 0. */
  attempt: z.number().int().min(0),
  deliveredAt: z.iso.datetime(),
});
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;
