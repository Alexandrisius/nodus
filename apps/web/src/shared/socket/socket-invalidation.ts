import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeEnvelope } from '@nodus/contracts';

import { chatKeys } from '../chat/api.js';
import { applySentMessage } from '../chat/ws-apply.js';
import { createKeyBatcher, type KeyBatcher } from './invalidation-batcher.js';

/**
 * Роутер WS-событий → инвалидации (#104: сервер — единственная истина).
 * Раунд 3 («буря рефечей»): (1) message_sent с полным DTO применяется в кэш
 * ЛОКАЛЬНО по seq (ws-apply) — рефеча ленты нет вовсе; (2) остальные события
 * коалесцируются батчером (invalidation-batcher): каждый ключ инвалидируется
 * один раз за окно, список бесед — по медленному ярусу (гистерезис
 * пересортировки). Префикс messages(id) покрывает и тред-ключи.
 */
export interface RealtimeInvalidator {
  handle: (envelope: RealtimeEnvelope) => void;
  flush: () => void;
  dispose: () => void;
}

export function createRealtimeInvalidator(queryClient: QueryClient): RealtimeInvalidator {
  const batcher: KeyBatcher = createKeyBatcher((key) => {
    void queryClient.invalidateQueries({ queryKey: key });
  });

  function push(conversationId: string | null, key: 'messages' | 'states' | 'pins'): void {
    if (!conversationId) return;
    if (key === 'messages') batcher.push(chatKeys.messages(conversationId), 'feed');
    else if (key === 'states') batcher.push(chatKeys.threadStates(conversationId), 'feed');
    else batcher.push(chatKeys.pins(conversationId), 'feed');
  }

  return {
    handle(envelope: RealtimeEnvelope): void {
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;
      const conversationId =
        typeof payload.conversationId === 'string' ? payload.conversationId : null;

      switch (envelope.type) {
        case 'chat.message_sent': {
          // Локальное применение по seq; дыра/нет DTO — коалесцированный рефеч.
          const applied = applySentMessage(queryClient, payload as never);
          if (!applied) push(conversationId, 'messages');
          // Точка «есть новые»/счётчик трэда и превью списка — по окнам.
          push(conversationId, 'states');
          if (conversationId) batcher.push(chatKeys.conversations(), 'list');
          return;
        }
        case 'chat.message_edited':
        case 'chat.message_deleted':
          push(conversationId, 'messages');
          if (conversationId) batcher.push(chatKeys.conversations(), 'list');
          return;
        case 'chat.message_read':
          // Галочки автора + бейдж непрочитанных + точки трэдов.
          push(conversationId, 'messages');
          push(conversationId, 'states');
          if (conversationId) batcher.push(chatKeys.conversations(), 'list');
          return;
        case 'chat.reaction_added':
        case 'chat.reaction_removed':
        case 'chat.thread_created':
          push(conversationId, 'messages');
          push(conversationId, 'states');
          return;
        case 'chat.message_pinned':
        case 'chat.message_unpinned':
          push(conversationId, 'messages');
          push(conversationId, 'pins');
          return;
        case 'chat.conversation_created':
        case 'chat.member_added':
          batcher.push(chatKeys.conversations(), 'list');
          return;
        default:
          return;
      }
    },
    flush: batcher.flush,
    dispose: batcher.dispose,
  };
}
