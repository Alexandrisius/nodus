import { z } from 'zod';

/**
 * Ответ списка (канон — patterns.md, api-conventions.md): `{ items, nextCursor }`.
 * totals/offset/pageInfo не возвращаются; `nextCursor` — opaque-токен или null.
 */
export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().min(1).nullable(),
  });
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Лимит страницы: ≤ 100, по умолчанию 50 (api-conventions.md). */
export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_DEFAULT_LIMIT = 50;

/**
 * Query-параметры курсорной пагинации `?cursor=&limit=`.
 * Сортировка детерминирована на уровне репозитория (не здесь).
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;
