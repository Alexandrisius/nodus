import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeEnvelope } from '@nodus/contracts';

import { chatKeys } from '../chat/api.js';
import { favoriteKeys } from '../chat/favorites-api.js';
import { applyReadEvent, applyReactionEvent, applySentMessage } from '../chat/ws-apply.js';
import { notificationsKeys } from '../notifications-keys.js';
import { createKeyBatcher, type KeyBatcher } from './invalidation-batcher.js';

/**
 * Роутер WS-событий → инвалидации (#104: сервер — единственная истина).
 * Раунд 3 («буря рефечей»): (1) message_sent с полным DTO применяется в кэш
 * ЛОКАЛЬНО по seq (ws-apply) — рефеча ленты нет вовсе; (2) остальные события
 * коалесцируются батчером (invalidation-batcher): каждый ключ инвалидируется
 * один раз за окно, список бесед — по медленному ярусу (гистерезис
 * пересортировки). Префикс messages(id) покрывает и тред-ключи.
 * notification.* (#100): журнал/сводка — быстрый ярус; тосты — через мост
 * notification-bridge (фича регистрирует синк, shared не знает features).
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
          // Карточки избранного — живые ссылки на оригинал (#171): правка
          // отражается в карточке, удаление гасит её в надгробие.
          batcher.push(favoriteKeys.all, 'feed');
          if (conversationId) batcher.push(chatKeys.conversations(), 'list');
          return;
        case 'chat.message_read': {
          // Шторм квитанций (аудит #123): чужое прочтение патчит readBy автора
          // ЛОКАЛЬНО (ws-apply) — без рефеча ленты и БЕЗ инвалидации списка
          // бесед/состояний (свой бейдж гасит успех собственного POST /read,
          // точки трэдов — тоже). Нет кэша для патча — прежние инвалидации.
          const applied = applyReadEvent(queryClient, payload as never);
          if (!applied) {
            push(conversationId, 'messages');
            push(conversationId, 'states');
          }
          return;
        }
        case 'chat.reaction_added':
        case 'chat.reaction_removed': {
          // Локальный патч реакций (ws-apply, #124): чипы обновляются без
          // рефеча; нет сообщения в кэше — коалесцированный рефеч ленты.
          const applied = applyReactionEvent(
            queryClient,
            payload as never,
            envelope.type === 'chat.reaction_added',
          );
          if (!applied) push(conversationId, 'messages');
          return;
        }
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
          batcher.push(chatKeys.conversations(), 'list');
          return;
        case 'chat.conversation_updated':
          // #186: название/аватар — у всех участников (список + топбар);
          // подписанный URL аватара нестабилен — только рефеч.
          batcher.push(chatKeys.conversations(), 'list');
          return;
        case 'chat.member_added':
          batcher.push(chatKeys.conversations(), 'list');
          if (conversationId) batcher.push(chatKeys.members(conversationId), 'feed');
          return;
        case 'chat.member_removed':
        case 'chat.member_role_changed':
          batcher.push(chatKeys.conversations(), 'list');
          if (conversationId) batcher.push(chatKeys.members(conversationId), 'feed');
          return;
        case 'chat.attachment_updated': {
          // Новая версия файла из сохранения ONLYOFFICE (#182): лента —
          // снапшотные DTO вложений рефечатся, а файловые ключи (сессия
          // просмотрщика) инвалидируются — версия подхватывается без F5.
          push(conversationId, 'messages');
          if (typeof payload.fileId === 'string') {
            batcher.push(['files', payload.fileId], 'feed');
          }
          return;
        }
        case 'chat.favorite_added':
          // Личное состояние (#171) + активность: новая звезда поднимает
          // «Избранное» в списке бесед (сервер трогает last_message_at,
          // фидбек приёмки #215) — рефечим список.
          batcher.push(favoriteKeys.all, 'feed');
          batcher.push(chatKeys.conversations(), 'list');
          return;
        case 'chat.favorite_removed':
        case 'chat.favorite_updated':
          // Личное состояние (#171): событие приходит только в свою
          // user-комнату — обновляем витрины и звёзды-индикаторы.
          batcher.push(favoriteKeys.all, 'feed');
          return;
        case 'notification.dispatch_requested':
        case 'notification.read':
        case 'notification.acked':
          batcher.push(notificationsKeys.all, 'feed');
          return;
        default:
          return;
      }
    },
    flush: batcher.flush,
    dispose: batcher.dispose,
  };
}
