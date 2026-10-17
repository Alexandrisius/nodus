import { z } from 'zod';

import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/**
 * Справочники (dictionaries, ядро, I15): бизнес-списки живут данными, а не
 * кодом. Справочник адресуется стабильным `code` (kebab-case), элемент —
 * по ID (переименование элемента не трогает ссылающиеся сущности).
 * Удаления нет — только архивация (`isActive: false`); архивный элемент
 * остаётся читаемым для старых записей, но не предлагается в новых.
 */

/** Код справочника: стабильный машинный ключ (`document-kind`). */
export const dictionaryCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

export type DictionaryCode = z.infer<typeof dictionaryCodeSchema>;

/** Системные справочники — их существование гарантирует миграция,
 *  потребители адресуют их этими кодами (элементы — данные администратора). */
export const SystemDictionary = {
  /** Вид документа корреспонденции (Инструкция РБ по делопроизводству). */
  DOCUMENT_KIND: 'document-kind',
} as const;

export type SystemDictionary = (typeof SystemDictionary)[keyof typeof SystemDictionary];

export const dictionarySchema = z.object({
  id: z.uuid(),
  code: dictionaryCodeSchema,
  name: z.string().min(1),
  /** Элементы образуют дерево (`parentId`); плоский справочник — false. */
  hierarchical: z.boolean(),
  /** Создан миграцией и нужен коду-потребителю: не архивируется, `code` неизменен. */
  isSystem: z.boolean(),
});

export type Dictionary = z.infer<typeof dictionarySchema>;

export const dictionaryItemSchema = z.object({
  id: z.uuid(),
  dictionaryId: z.uuid(),
  /** Родитель в иерархическом справочнике; у плоского — всегда null. */
  parentId: z.uuid().nullable(),
  /** Необязательный машинный ключ элемента (уникален в справочнике). */
  code: z.string().min(1).nullable(),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type DictionaryItem = z.infer<typeof dictionaryItemSchema>;

/** `GET /dictionaries/:code/items` — элементы в порядке (sortOrder, name, id). */
export const listDictionaryItemsQuerySchema = cursorQuerySchema.extend({
  includeArchived: z.stringbool().default(false),
});

export type ListDictionaryItemsQuery = z.infer<typeof listDictionaryItemsQuerySchema>;

/** `GET /dictionaries` — справочники в порядке `code`. */
export const listDictionariesQuerySchema = cursorQuerySchema;

export type ListDictionariesQuery = z.infer<typeof listDictionariesQuerySchema>;
