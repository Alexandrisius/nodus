import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';
import { conversationTypeSchema, messageAttachmentSchema } from './chat.schemas.js';

/** Витрина беседы (#211): серверные списки вложений и ссылок панели «О чате»
 *  + источники «Избранного». Списки читают БД (не загруженное окно ленты):
 *  вложение за пределами окна видно. Счётчики по типам — денормализованные
 *  (conversation_attachment_stats, Δ в транзакциях состава), модель
 *  Telegram getSearchCounters / Битрикс24: чтение O(1), списки — keyset. */

/** Тип секции витрины: media = вложение kind='image', document = kind='file'
 *  (стикеры — НЕ файлы пользователя, в витрине их нет; голосовые/GIF — с
 *  будущими фичами), link = URL из текста сообщения (write-time проекция
 *  message_links — извлечение при отправке/правке, не скан текстов на чтении). */
export const vaultItemTypeSchema = z.enum(['media', 'document', 'link']);
export type VaultItemType = z.infer<typeof vaultItemTypeSchema>;

export const vaultCountsSchema = z.object({
  media: z.number().int().min(0),
  document: z.number().int().min(0),
  link: z.number().int().min(0),
});
export type VaultCounts = z.infer<typeof vaultCountsSchema>;

/** Контекст источника элемента витрины: кто/когда отправил, где искать
 *  прыжок («показать в чате», jump-store #171). */
const vaultItemBaseSchema = z.object({
  messageId: z.uuid(),
  conversationId: z.uuid(),
  /** Ответ в треде канала: прыжок целится в окно треда. */
  threadRootId: z.uuid().nullable(),
  author: userRefSchema,
  /** Момент сообщения — ось витрины (новые сверху). */
  createdAt: z.iso.datetime(),
});

/** Элемент-вложение (media | document): DTO вложения как в ленте. */
const vaultAttachmentBaseSchema = vaultItemBaseSchema.extend({
  attachment: messageAttachmentSchema,
});
export type VaultAttachmentItem = z.infer<typeof vaultAttachmentBaseSchema>;

export const vaultMediaItemSchema = vaultAttachmentBaseSchema.extend({
  type: z.literal('media'),
});
export type VaultMediaItem = z.infer<typeof vaultMediaItemSchema>;

export const vaultDocumentItemSchema = vaultAttachmentBaseSchema.extend({
  type: z.literal('document'),
});
export type VaultDocumentItem = z.infer<typeof vaultDocumentItemSchema>;

/** Элемент-ссылка: URL из текста сообщения (домен/путь клиент форматирует). */
export const vaultLinkItemSchema = vaultItemBaseSchema.extend({
  type: z.literal('link'),
  url: z.string().min(1),
});
export type VaultLinkItem = z.infer<typeof vaultLinkItemSchema>;

export const vaultItemSchema = z.discriminatedUnion('type', [
  vaultMediaItemSchema,
  vaultDocumentItemSchema,
  vaultLinkItemSchema,
]);
export type VaultItem = z.infer<typeof vaultItemSchema>;

export const listConversationVaultQuerySchema = cursorQuerySchema.extend({
  type: vaultItemTypeSchema,
  /** Скоуп панели «Вся беседа / Этот тред» (#42). */
  threadRootId: z.uuid().optional(),
});
export type ListConversationVaultQuery = z.infer<typeof listConversationVaultQuerySchema>;

/** Ответ витрины: страница элементов ОДНОГО типа + счётчики всех трёх
 *  (сводка панели; счётчики — денормализованные stats, «сколько всего»). */
export const conversationVaultPageSchema = z.object({
  items: z.array(vaultItemSchema),
  nextCursor: z.string().min(1).nullable(),
  counts: vaultCountsSchema,
});
export type ConversationVaultPage = z.infer<typeof conversationVaultPageSchema>;

/** Источники «Избранного» (Ф3, реф Telegram Saved): чаты, откуда прилетали
 *  звёзды, + счётчики типов всего избранного. «Записи» — псевдоисточник
 *  (свои сообщения чата «Избранное»), отдельным полем. */
export const favoriteSourceSchema = z.object({
  conversationId: z.uuid(),
  /** Подпись как у карточки: группа/канал — название, direct — имя
   *  собеседника; null у task/letter (фронт — i18n-строка). */
  title: z.string().nullable(),
  conversationType: conversationTypeSchema,
  /** Последняя закладка из этого чата — сортировка и подпись даты. */
  lastFavoritedAt: z.iso.datetime(),
  /** Живых закладок из этого чата. */
  count: z.number().int().min(1),
});
export type FavoriteSource = z.infer<typeof favoriteSourceSchema>;

export const favoriteSourcesSchema = z.object({
  /** Псевдоисточник «Записи»: свои сообщения чата «Избранное» (не звёзды). */
  notes: z.object({
    count: z.number().int().min(0),
    /** Последняя запись (живое сообщение автора = владелец чата). */
    lastAt: z.iso.datetime().nullable(),
  }),
  /** Живые источники-звёзды, новые закладки сверху. */
  sources: z.array(favoriteSourceSchema),
  /** Типы всего избранного (медиа/документы/ссылки по карточкам). */
  counts: vaultCountsSchema,
});
export type FavoriteSources = z.infer<typeof favoriteSourcesSchema>;
