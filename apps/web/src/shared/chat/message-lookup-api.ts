import { useQuery } from '@tanstack/react-query';
import type { MessageLookupResult } from '@nodus/contracts';

import { api } from '../api-client.js';
import { chatKeys } from './chat-keys.js';

/**
 * Живые сообщения беседы по id (#380): окну перехода нужны файлы и
 * сообщения итога, которые могут быть вне загруженной ленты. Только
 * участник беседы (иначе 404); отсутствующие молча выпадают. Инвалидация —
 * общие WS-события сообщений (ключ под `chatKeys.all`).
 */
export function useMessagesLookup(
  conversationId: string | null,
  ids: readonly string[],
  enabled = true,
) {
  const unique = [...new Set(ids)];
  return useQuery({
    queryKey: chatKeys.lookup(conversationId ?? '', unique),
    queryFn: () =>
      api<MessageLookupResult>(
        `/chat/conversations/${conversationId}/messages/lookup?ids=${unique.join(',')}`,
      ),
    enabled: enabled && conversationId !== null && unique.length > 0,
    staleTime: 30_000,
  });
}
