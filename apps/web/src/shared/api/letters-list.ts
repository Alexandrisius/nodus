import { useQuery } from '@tanstack/react-query';
import type { LetterListItem, Paginated } from '@nodus/contracts';

import { api } from '../api-client.js';
import { lettersKeys } from './letters-keys.js';

export type LettersFolder = 'incoming' | 'outgoing' | 'registry';

/** Список писем — ОДИН хук на продукт, ключ shared (потребители: фича
 *  корреспонденции, карточка контрагента «связанные письма»; канон — как
 *  tasks-keys/users-list, без cross-feature импорта, I6). Без folder — все
 *  письма; counterpartyId — письма контрагента. */
export function useLettersList(folder?: LettersFolder, counterpartyId?: string) {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (counterpartyId) params.set('counterpartyId', counterpartyId);
  const qs = params.toString();
  return useQuery({
    queryKey: [...lettersKeys.list(folder ?? 'all'), counterpartyId ?? null],
    queryFn: () => api<Paginated<LetterListItem>>(`/letters${qs ? `?${qs}` : ''}`),
  });
}
