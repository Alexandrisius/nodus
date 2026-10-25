import { useQuery } from '@tanstack/react-query';
import type { Dictionary, DictionaryItem, Paginated } from '@nodus/contracts';
import { PAGINATION_MAX_LIMIT } from '@nodus/contracts';

import { api } from '../api-client.js';
import { dictionariesKeys } from './keys.js';

export { dictionariesKeys } from './keys.js';

/** Предохранитель добора страниц: 10 × 100 = 1000 вариантов — выше лимита
 *  справочника (500), «вечный» курсор не повесит вкладку. */
const ITEMS_MAX_PAGES = 10;

/** Элементы справочника по коду в порядке (sortOrder, name) — общий загрузчик
 *  для хука и `useQueries` фильтров (динамический набор справочников). */
export async function fetchDictionaryItems(
  code: string,
  includeArchived = false,
): Promise<DictionaryItem[]> {
  const items: DictionaryItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < ITEMS_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(PAGINATION_MAX_LIMIT) });
    if (includeArchived) params.set('includeArchived', 'true');
    if (cursor) params.set('cursor', cursor);
    const result = await api<Paginated<DictionaryItem>>(
      `/dictionaries/${encodeURIComponent(code)}/items?${params}`,
    );
    items.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return items;
}

/** Справочники целиком (малый каталог: код, имя, системность). */
export function useDictionaries() {
  return useQuery({
    queryKey: dictionariesKeys.list(),
    queryFn: async (): Promise<Dictionary[]> => {
      const result = await api<Paginated<Dictionary>>(
        `/dictionaries?limit=${PAGINATION_MAX_LIMIT}`,
      );
      return result.items;
    },
    staleTime: 60_000,
  });
}

/** Элементы справочника по коду в порядке (sortOrder, name); архивные — по
 *  флагу (старые значения читаются и с архивными подписями). */
export function useDictionaryItems(code: string | null, opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: dictionariesKeys.items(code ?? '', includeArchived),
    enabled: code !== null,
    queryFn: () => fetchDictionaryItems(code ?? '', includeArchived),
    staleTime: 60_000,
  });
}
