import { z } from 'zod';

/** Тип изменения — стандартная форма заметок о выпуске (Keep a Changelog,
 *  упрощённая для нетехнических пользователей): новое, улучшено, исправлено. */
export const changeTypeSchema = z.enum(['new', 'improved', 'fixed']);
export type ChangeType = z.infer<typeof changeTypeSchema>;

/** Порядок типов внутри модуля: сначала новое, исправления — последними. */
export const CHANGE_TYPE_ORDER: readonly ChangeType[] = ['new', 'improved', 'fixed'];

/** Кросс-модульное изменение (вход, шапка, скорость, приложение для Windows). */
export const GENERAL_MODULE = 'general';

export const releaseItemSchema = z.strictObject({
  /** id модуля из nav-registry (`tasks`, `chat`…) или `general`. Полнота
   *  проверяется unit-тестом данных: неизвестный id в рантайме падает в «Общее». */
  module: z.string().min(1),
  type: changeTypeSchema,
  /** Короткий заголовок — что появилось/изменилось (≤ 90 символов). */
  title: z.string().min(3).max(90),
  /** Одна-две фразы: что это даёт пользователю (≤ 320 символов). */
  text: z.string().min(10).max(320),
});
export type ReleaseItem = z.infer<typeof releaseItemSchema>;

/** Один выпуск = один JSON-файл `releases/<version>.json` (навык nodus-release). */
export const releaseSchema = z.strictObject({
  /** semver без «v» — совпадает с тегом `v<version>` на main (ADR-0004). */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** Дата выкатки на прод, YYYY-MM-DD. */
  date: z.iso.date(),
  /** Необязательная строка-итог выпуска (≤ 200 символов). */
  summary: z.string().min(10).max(200).optional(),
  items: z.array(releaseItemSchema).min(1),
});
export type Release = z.infer<typeof releaseSchema>;

/** Сравнение semver по убыванию (новые выпуски — первыми). */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
