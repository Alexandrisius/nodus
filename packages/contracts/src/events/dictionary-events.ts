import { z } from 'zod';

/**
 * Каталог событий справочников (#431, Р10; I9, I15). Каталожные — без
 * `audience`: справочники читают все, варианты полей живут в общих кэшах.
 * Правка варианта меняет подписи во всех полях с этим списком — клиенты
 * инвалидируют элементы по `dictionaryId`.
 */
export const DICTIONARY_EVENTS = {
  CREATED: 'dictionary.created',
  UPDATED: 'dictionary.updated',
  ITEM_CREATED: 'dictionary.item_created',
  ITEM_UPDATED: 'dictionary.item_updated',
  ITEM_ARCHIVED: 'dictionary.item_archived',
} as const;

export type DictionaryEventType = (typeof DICTIONARY_EVENTS)[keyof typeof DICTIONARY_EVENTS];

export const DICTIONARY_CATALOG_EVENTS: readonly string[] = [
  DICTIONARY_EVENTS.CREATED,
  DICTIONARY_EVENTS.UPDATED,
  DICTIONARY_EVENTS.ITEM_CREATED,
  DICTIONARY_EVENTS.ITEM_UPDATED,
  DICTIONARY_EVENTS.ITEM_ARCHIVED,
];

export const dictionaryChangedPayloadSchema = z.object({
  dictionaryId: z.uuid(),
  code: z.string().min(1),
});
export type DictionaryChangedPayload = z.infer<typeof dictionaryChangedPayloadSchema>;

export const dictionaryItemChangedPayloadSchema = z.object({
  dictionaryId: z.uuid(),
  itemId: z.uuid(),
  /** Изменённые ключи элемента (у архивного — `isActive`). */
  fields: z.array(z.string()).optional(),
});
export type DictionaryItemChangedPayload = z.infer<typeof dictionaryItemChangedPayloadSchema>;
