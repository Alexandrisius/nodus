import { useQuery } from '@tanstack/react-query';
import type { LetterListItem, Paginated } from '@nodus/contracts';

import { api } from '../api-client.js';
import { lettersKeys } from './letters-keys.js';

export type LettersFolder = 'incoming' | 'outgoing' | 'registry';

/** Список писем — ОДИН хук на продукт, ключ shared (потребители: фича
 *  корреспонденции, карточка контрагента «связанные письма»; канон — как
 *  tasks-keys/users-list, без cross-feature импорта, I6). Без folder — все
 *  письма; counterpartyId — письма контрагента. `enabled: false` — блок
 *  связи не запрашивается, пока счётчик пуст (модуля писем ещё нет, #55). */
export function useLettersList(
  folder?: LettersFolder,
  counterpartyId?: string,
  options: { enabled?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (counterpartyId) params.set('counterpartyId', counterpartyId);
  const qs = params.toString();
  return useQuery({
    queryKey: lettersKeys.folderList(folder ?? 'all', counterpartyId ?? null),
    queryFn: () => api<Paginated<LetterListItem>>(`/letters${qs ? `?${qs}` : ''}`),
    enabled: options.enabled ?? true,
  });
}
