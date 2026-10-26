import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  LetterAttachment,
  LetterDetail,
  LetterHistoryEntry,
  LetterResolvers,
  Paginated,
  ProcessType,
  WorkflowTransition,
} from '@nodus/contracts';
import { LETTER_LIMITS, SystemDictionary } from '@nodus/contracts';

import { ApiError, api, fetchSignedText } from '../../../shared/api-client.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { useDictionaryItems } from '../../../shared/dictionaries/queries.js';

/** Чтение корреспонденции (#55, §7.3). Списки вкладок — shared
 *  `useLettersInfinite` (общий с CRM и палитрой). */

const notFound = (error: unknown) => error instanceof ApiError && error.status === 404;

/** Карточка письма: 404 (нет/не видно) не повторяется — объяснение сразу. */
export function useLetterDetail(id: string) {
  return useQuery({
    queryKey: lettersKeys.detail(id),
    queryFn: () => api<LetterDetail>(`/letters/${id}`),
    enabled: id.length > 0 && !id.startsWith('temp-'),
    retry: (count, error) => !notFound(error) && count < 2,
  });
}

/** Кнопки маршрута письма (сервер решает, кому какие — условия движка). */
export function useLetterTransitions(id: string, enabled = true) {
  return useQuery({
    queryKey: lettersKeys.transitions(id),
    queryFn: () => api<WorkflowTransition[]>(`/letters/${id}/transitions`),
    enabled: enabled && id.length > 0,
    staleTime: 30_000,
  });
}

/** Журнал письма курсором (новые сверху, «Показать ещё» — старые). */
export function useLetterHistory(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: lettersKeys.history(id),
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<LetterHistoryEntry>>(
        `/letters/${id}/history${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/** «Принимают решения» — держатели `correspondence.resolve` (редко меняется). */
export function useLetterResolvers() {
  return useQuery({
    queryKey: lettersKeys.resolvers(),
    queryFn: () => api<LetterResolvers>('/letters/resolvers'),
    staleTime: 5 * 60_000,
  });
}

/** Способы поступления (Р14) — системный справочник. */
export function useReceiptMethods() {
  return useDictionaryItems(SystemDictionary.RECEIPT_METHOD);
}

/** Типы писем: префикс серии номера («Вх»), выбор типа ручного создания. */
export function useLetterTypes() {
  return useQuery({
    queryKey: lettersKeys.types(),
    queryFn: () => api<ProcessType[]>('/workflows/types?category=letter'),
    staleTime: 5 * 60_000,
  });
}

/** Текст HTML/текстового тела (≤ 2 МБ, Р9): больше — карточка скачивания
 *  без запроса. Ссылка подписана — кэш по ней. */
export function useLetterBodyText(attachment: LetterAttachment) {
  const tooLarge = attachment.size > LETTER_LIMITS.bodyPreviewBytes;
  return useQuery({
    queryKey: lettersKeys.bodyText(attachment.url),
    queryFn: ({ signal }) =>
      fetchSignedText(attachment.url, LETTER_LIMITS.bodyPreviewBytes, signal),
    enabled: !tooLarge,
    staleTime: Infinity,
    retry: 1,
  });
}
