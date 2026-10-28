import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '../../../shared/api-client.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { mapLetterInPages, type LettersPages } from '../../../shared/api/letters-list.js';

/**
 * «Я открывал письмо» (редизайн #56): открытие карточки гасит личную точку
 * в списке «Новые». Один POST на открытие (идемпотентен на сервере, ключ
 * ставит `api`); после ответа строка во всех списках помечается
 * просмотренной патчем кэша — без перезапроса. Ошибки — тихо: точка не
 * критична, карточка работает и без неё.
 */
export function useMarkLetterViewed(id: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!id || id.startsWith('temp-')) return;
    let cancelled = false;
    void api<void>(`/letters/${id}/view`, { method: 'POST' })
      .then(() => {
        if (cancelled) return;
        for (const [key] of queryClient.getQueriesData<LettersPages>({
          queryKey: lettersKeys.lists(),
        })) {
          queryClient.setQueryData<LettersPages>(key, (data) =>
            mapLetterInPages(data, id, (letter) => ({ ...letter, viewed: true })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [queryClient, id]);
}
