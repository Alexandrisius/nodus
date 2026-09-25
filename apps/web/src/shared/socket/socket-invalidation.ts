import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeEnvelope } from '@nodus/contracts';

import { chatKeys } from '../chat/api.js';

/**
 * Роутер WS-событий → инвалидации (жёсткое правило #104: события применяются
 * ТОЛЬКО как сигнал к рефечу, локального применения состояний нет — сервер
 * единственная истина). Префикс messages(id) покрывает и тред-ключи.
 */
export function applyRealtimeInvalidation(
  queryClient: QueryClient,
  envelope: RealtimeEnvelope,
): void {
  const payload = (envelope.payload ?? {}) as Record<string, unknown>;
  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;

  switch (envelope.type) {
    case 'chat.message_sent':
    case 'chat.message_edited':
    case 'chat.message_deleted':
      // Лента/треды беседы + список (превью последнего сообщения, unread).
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      }
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      return;
    case 'chat.message_read':
      // Галочки автора + бейдж непрочитанных у всех участников.
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      }
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      return;
    case 'chat.reaction_added':
    case 'chat.reaction_removed':
    case 'chat.thread_created':
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      }
      return;
    case 'chat.message_pinned':
    case 'chat.message_unpinned':
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
      }
      return;
    case 'chat.conversation_created':
    case 'chat.member_added':
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      return;
    default:
      return;
  }
}
