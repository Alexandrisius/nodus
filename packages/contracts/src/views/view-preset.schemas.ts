import { z } from 'zod';

/**
 * Персональные настройки представлений (кастомизация полей, §10.5): сейчас
 * живут в localStorage клиента, на проде — DTO API персонализации (I13).
 * Ключ вида — '<module>.<view>' ('tasks.list', 'letters.list'…); ключ поля —
 * id из реестра полей модуля. Неизвестные ключи клиент отбрасывает (новые
 * поля модуля подхватываются дефолтами реестра).
 */

export const viewFieldPrefsSchema = z.object({
  visible: z.boolean(),
  /** Ширина колонки таблицы, px (у карточек и flex-полей отсутствует). */
  width: z.number().int().min(40).max(800).optional(),
  /** Порядок колонки слева направо (0..n; поля без order — ПОСЛЕ
   *  упорядоченных, в порядке реестра модуля — слияние без миграций). */
  order: z.number().int().min(0).optional(),
});

export type ViewFieldPrefs = z.infer<typeof viewFieldPrefsSchema>;

/** Сортировка списка: одна колонка (классика), двухстадийная ↑/↓. */
export const viewSortSchema = z.object({
  /** id поля из реестра модуля (на бэке — имя поля `?sort=field:dir`). */
  field: z.string().min(1),
  dir: z.enum(['asc', 'desc']),
});

export type ViewSort = z.infer<typeof viewSortSchema>;

export const viewPresetSchema = z.object({
  version: z.literal(1),
  views: z.record(z.string(), z.record(z.string(), viewFieldPrefsSchema)),
  /** Активная сортировка по виду ('tasks.list' → поле+направление). */
  sorts: z.record(z.string(), viewSortSchema).optional(),
});

export type ViewPreset = z.infer<typeof viewPresetSchema>;
