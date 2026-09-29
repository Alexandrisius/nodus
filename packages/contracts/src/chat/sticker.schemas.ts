import { z } from 'zod';

/** Контракты стикеров чата (#143, модель Telegram/Битрикс24): паки личные и
 *  корпоративные, дистрибуция «из чата», эмодзи-привязки (датасет будущих
 *  подсказок «эмодзи → стикеры»). Отдельный файл — скоуп стикеров, не мешает
 *  массе conversation/message-контрактов (I5). */

export const stickerPackScopeSchema = z.enum(['corporate', 'personal']);
export type StickerPackScope = z.infer<typeof stickerPackScopeSchema>;

/** Стикер пака: файл живёт в модуле files (fileId в БД; клиенту — готовый
 *  подписанный url). Анимация — mime video/webm (Telegram-формат) или
 *  анимированный WebP; клиент решает по mime: webm → <video>, иначе <img>. */
export const stickerSchema = z.object({
  id: z.uuid(),
  packId: z.uuid(),
  /** Эмодзи-привязки (1–3, обязательны): поиск, будущие подсказки, AT. */
  emojis: z.array(z.string().min(1)).min(1).max(3),
  url: z.string(),
  mime: z.string().min(1),
  size: z.number().int().min(0),
  /** Габариты: резерв бокса до загрузки (лента без сдвига). */
  width: z.number().int().min(0).nullable(),
  height: z.number().int().min(0).nullable(),
});
export type Sticker = z.infer<typeof stickerSchema>;

/** Пак в списке (GET /chat/stickers/packs): со стикерами целиком — объём
 *  пилота мал, одна выдача без водопада запросов; разбиение на лёгкий
 *  список + деталь — при реальном росте каталога. */
export const stickerPackSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(64),
  scope: stickerPackScopeSchema,
  /** Пак текущего пользователя (создан им; управление «для всех»). */
  owned: z.boolean(),
  /** Установлен текущему пользователю («добавил из чата»); корпоративные
   *  видны всегда — installed для них не имеет смысла и false. */
  installed: z.boolean(),
  stickers: z.array(stickerSchema),
});
export type StickerPack = z.infer<typeof stickerPackSchema>;

export const stickerPackListSchema = z.object({
  items: z.array(stickerPackSchema),
});
export type StickerPackList = z.infer<typeof stickerPackListSchema>;

/** Создание пака: загрузка стикеров — отдельным multipart-шагом
 *  (POST /chat/stickers/packs/:id/stickers). scope=corporate — право
 *  sticker.manage (I8, гейт на сервере). */
export const createStickerPackBodySchema = z.object({
  title: z.string().trim().min(1).max(64),
  scope: stickerPackScopeSchema,
});
export type CreateStickerPackBody = z.infer<typeof createStickerPackBodySchema>;

/** Переименование пака (владелец/админ). */
export const renameStickerPackBodySchema = z.object({
  title: z.string().trim().min(1).max(64),
});
export type RenameStickerPackBody = z.infer<typeof renameStickerPackBodySchema>;

/** Метаданные стикера на вложении сообщения: рендер и поповер пака
 *  («Добавить пак») без доп-запроса; снапшот на момент отправки. */
export const stickerMetaSchema = z.object({
  packId: z.uuid(),
  packTitle: z.string().min(1).max(64),
  packScope: stickerPackScopeSchema,
  emojis: z.array(z.string().min(1)).min(1).max(3),
});
export type StickerMeta = z.infer<typeof stickerMetaSchema>;
