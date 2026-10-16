import type { QueryClient } from '@tanstack/react-query';
import type { ThreadStateList } from '@nodus/contracts';

import { chatKeys } from './chat-keys.js';
import { fetchThreadStates } from './chat-queries.js';

/**
 * Гейт «наблюдатель трэда» для всплытия уведомлений (#300, канон раунда 3):
 * ответ в трэде уведомляет только наблюдателей и @упомянутых. Сервер считает
 * получателей журнала так же (priority-resolver); попапы оболочки и браузерные
 * уведомления живут на WS-message_sent (его получает весь состав беседы для
 * ленты) — повторный фильтр здесь. Источник — кэш состояний трэдов беседы
 * (`useThreadStates`, GET /threads/state: снимок «мои наблюдаемые трэды»);
 * холодный кэш — один догоняющий запрос (staleTime гасит всплески), сбой
 * сети — не глушим: журнал уже отфильтрован сервером.
 */
export async function threadNotifyAllowed(
  queryClient: QueryClient,
  meId: string | null,
  conversationId: string,
  threadRootId: string,
  mentionedUserIds: readonly string[],
): Promise<boolean> {
  if (meId !== null && mentionedUserIds.includes(meId)) return true;
  const key = chatKeys.threadStates(conversationId);
  const cached = queryClient.getQueryData<ThreadStateList>(key);
  if (cached) return cached.items.some((s) => s.threadRootId === threadRootId);
  try {
    const fresh = await queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => fetchThreadStates(conversationId),
      staleTime: 15_000,
    });
    return fresh.items.some((s) => s.threadRootId === threadRootId);
  } catch {
    return true;
  }
}
