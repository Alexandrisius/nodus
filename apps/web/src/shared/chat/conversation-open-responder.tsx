import { useEffect } from 'react';

import { useChatHostNavigation } from './chat-host.js';
import { useConversationOpenStore } from './conversation-open-store.js';

/**
 * Резидент открытия беседы (#306): монтируется внутри провайдера
 * ChatHostNavigation (messenger-body), исполняет глобальные запросы
 * conversation-open-store через навигацию хоста — так глобальный
 * SelectionQuoteBubble (app-shell, вне контекста) открывает исходный чат
 * карточки избранного. Null-компонент, паттерн JumpResponder.
 */
export function ConversationOpenResponder(): null {
  const nav = useChatHostNavigation();
  const request = useConversationOpenStore((s) => s.request);

  useEffect(() => {
    if (!request || !nav) return;
    useConversationOpenStore.getState().consume(request.nonce);
    nav.openConversation(request.conversationId, request.threadRootId);
  }, [request, nav]);

  return null;
}
