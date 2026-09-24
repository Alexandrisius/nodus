import { z } from 'zod';
import { uiPreferencesSchema, viewFieldPrefsSchema, viewSortSchema } from '@nodus/contracts';

/**
 * Zod-валидация persist-сторов при rehydrate (I7 «zod на границах», аудит
 * #45 — КРИТИЧНО: navOrder:"строка" ронял весь портал в белый экран через
 * TypeError в resolveOrder). Zustand persist сам переживает лишь БИТЫЙ JSON;
 * валидный JSON с неверной формой (ручная правка, устаревший формат после
 * релиза, обрыв записи) без валидации молча смержился бы в state. Каждый
 * persist-стор валидирует сохранённое envelope-схемой: невалидный узел
 * отбрасывается на дефолт через .catch (гранулярность — один скоуп/вид,
 * соседние настройки не страдают). Envelope — клиентские обёртки над DTO
 * contracts (не API-контракты, потому живут здесь, а не в packages).
 * version: 1 у сторов без migrate: при смене версии zustand отбрасывает
 * сохранённое сам — смена формы состояния = bump версии, миграция не нужна,
 * пока настройки допустимо сбрасывать (до пилота — допустимо).
 */

/** Скоупы персонализации навигации: сломанный скоуп → {} (слой «не задан»). */
export const uiPrefsEnvelopeSchema = z.object({
  personal: uiPreferencesSchema.catch({}),
  company: uiPreferencesSchema.catch({}),
});

/** Настройки представлений: сломанный вид → {} (дефолт реестра полей). */
export const viewsEnvelopeSchema = z.object({
  views: z.record(z.string(), z.record(z.string(), viewFieldPrefsSchema).catch({})).catch({}),
  sorts: z.record(z.string(), viewSortSchema).catch({}),
});

/** Каркас (тема + служебная полоса): сломанное поле → дефолт поля. */
export const shellEnvelopeSchema = z.object({
  theme: z.enum(['dark', 'light']).catch('light'),
  edgeOpen: z.boolean().catch(false),
});

/** Настройки ленты чата. */
export const chatPrefsEnvelopeSchema = z.object({
  align: z.enum(['one', 'both']).catch('one'),
});

/** Черновики композера (#87): текст + сериализуемый контекст reply/edit.
 *  Вложения НЕ персистятся (канон research: файлы черновика не переживают
 *  reload ни у кого) — partialize стора их отсекает. Сломанный черновик
 *  беседы отбрасывается, соседние живут. */
const chatDraftSchema = z.object({
  text: z.string().catch(''),
  reply: z
    .object({
      messageId: z.string(),
      author: z.object({
        id: z.string(),
        displayName: z.string(),
        avatarUrl: z.string().nullable(),
      }),
      snippet: z.string(),
      quoteText: z.string().nullable(),
      attachmentKind: z.enum(['image', 'file']).nullable(),
      inThread: z.string().nullable(),
    })
    .nullable()
    .catch(null),
  edit: z
    .object({
      messageId: z.string(),
      originalText: z.string(),
    })
    .nullable()
    .catch(null),
  preEditText: z.string().nullable().catch(null),
});

export const chatDraftsEnvelopeSchema = z.object({
  drafts: z.record(z.string(), chatDraftSchema).catch({}),
});

/**
 * Фабрика merge-функции zustand persist: сохранённое состояние пропускается
 * через envelope-схему; невалидное целиком (не объект) → текущий дефолт.
 * Передавать в опцию `merge` persist-мидлвары с ЯВНЫМ типом полного стора:
 * `merge: zodPersistMerge<MyState>(myEnvelopeSchema)` — persisted-часть
 * (partialized) мёржится поверх current, функции стора не затрагиваются.
 */
export function zodPersistMerge<S extends object>(schema: z.ZodType<unknown>) {
  return (persisted: unknown, current: S): S => {
    const parsed = schema.safeParse(persisted);
    return parsed.success ? { ...current, ...(parsed.data as Partial<S>) } : current;
  };
}
