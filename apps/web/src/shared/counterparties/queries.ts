import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  CounterpartyCard,
  CounterpartyListItem,
  CounterpartyMatch,
  Paginated,
} from '@nodus/contracts';
import { normalizeUnp } from '@nodus/contracts';

import { api } from '../api-client.js';
import { counterpartiesKeys, type CounterpartyPageParams } from './keys.js';

/** Размер страницы реестра: 50 — канон списков (api-conventions.md). */
const PAGE_LIMIT = 50;
/** Подсказки автокомплита: одна небольшая страница. */
const OPTIONS_LIMIT = 20;

function pageQuery(params: CounterpartyPageParams, cursor: string | null, limit: number): string {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (params.search) qs.set('search', params.search);
  if (params.includeArchived) qs.set('includeArchived', 'true');
  if (cursor) qs.set('cursor', cursor);
  return `/counterparties?${qs.toString()}`;
}

/** Реестр контрагентов — бесконечная прокрутка (keyset-курсор сервера). */
export function useCounterpartiesPages(params: CounterpartyPageParams) {
  return useInfiniteQuery({
    queryKey: counterpartiesKeys.pages(params),
    queryFn: ({ pageParam }) =>
      api<Paginated<CounterpartyListItem>>(pageQuery(params, pageParam, PAGE_LIMIT)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Подсказки combobox: серверный поиск, прежние данные держатся, пока грузятся
 *  новые (панель не мигает). Пустой запрос — первая страница справочника. */
export function useCounterpartyOptions(search: string) {
  const params: CounterpartyPageParams = {
    search: search.trim() || undefined,
    includeArchived: false,
  };
  return useQuery({
    queryKey: counterpartiesKeys.options(params.search ?? ''),
    queryFn: () => api<Paginated<CounterpartyListItem>>(pageQuery(params, null, OPTIONS_LIMIT)),
    placeholderData: keepPreviousData,
    select: (page) => page.items,
  });
}

/** УНП для подсказки: нормализуется общей грамматикой контракта; мусор и
 *  незавершённый ввод («УНП», «100-») на сервер не уходят (там 400). */
export function similarUnpQuery(raw: string): string {
  const normalized = normalizeUnp(raw);
  return /^[0-9A-ZА-ЯЁ]{1,32}$/u.test(normalized) ? normalized : '';
}

/** Похожие контрагенты при вводе (регистрация письма, создание карточки). */
export function useSimilarCounterparties(input: { name: string; unp: string }) {
  const name = input.name.trim();
  const unp = similarUnpQuery(input.unp);
  const enabled = name.length >= 2 || unp.length >= 3;
  return useQuery({
    queryKey: counterpartiesKeys.similar({ name, unp }),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (name) qs.set('name', name);
      if (unp) qs.set('unp', unp);
      return api<CounterpartyMatch[]>(`/counterparties/similar?${qs.toString()}`);
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Карточка контрагента (в том числе архивная). */
export function useCounterpartyCard(id: string) {
  return useQuery({
    queryKey: counterpartiesKeys.detail(id),
    queryFn: () => api<CounterpartyCard>(`/counterparties/${id}`),
    enabled: id.length > 0,
  });
}
