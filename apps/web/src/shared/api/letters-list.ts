import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { LetterBox, LetterListItem, Paginated } from '@nodus/contracts';

import { api } from '../api-client.js';
import { lettersKeys, type LettersListFilters } from './letters-keys.js';

export type LettersPages = InfiniteData<Paginated<LetterListItem>, string | null>;

function listPath(box: LetterBox | null, filters: LettersListFilters, cursor: string | null) {
  const params = new URLSearchParams();
  if (box) params.set('box', box);
  if (filters.search) params.set('search', filters.search);
  if (filters.counterpartyId) params.set('counterpartyId', filters.counterpartyId);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return `/letters${qs ? `?${qs}` : ''}`;
}

/** Список писем курсором — ОДИН хук на продукт (#55, ключ shared): вкладки
 *  «Новые»/«Входящие»/«Исходящие», вкладка «Письма» контрагента, палитра.
 *  Сервер сортирует сам (новые — по поступлению, журналы — по регистрации);
 *  поиск — серверный. `enabled: false` — блок связи не запрашивается. */
export function useLettersInfinite(
  box: LetterBox | null,
  filters: LettersListFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: lettersKeys.list(box, filters),
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<LetterListItem>>(listPath(box, filters, pageParam), { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

/** Строки всех загруженных страниц. */
export function letterRows(data: LettersPages | undefined): LetterListItem[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

/** Правка письма во всех страницах (оптимистичные патчи — через
 *  `pages[].items`, gotcha #460: плоский `items` у infinite-кэша не живёт). */
export function mapLetterInPages(
  data: LettersPages | undefined,
  id: string,
  map: (letter: LetterListItem) => LetterListItem | null,
): LettersPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((letter) => {
        if (letter.id !== id) return [letter];
        const next = map(letter);
        return next ? [next] : [];
      }),
    })),
  };
}
