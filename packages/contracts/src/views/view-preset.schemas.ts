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
});

export type ViewFieldPrefs = z.infer<typeof viewFieldPrefsSchema>;

export const viewPresetSchema = z.object({
  version: z.literal(1),
  views: z.record(z.string(), z.record(z.string(), viewFieldPrefsSchema)),
});

export type ViewPreset = z.infer<typeof viewPresetSchema>;
