import type { QueryClient } from '@tanstack/react-query';
import type { ChatMessage, ChatMessageSentPayload, Paginated } from '@nodus/contracts';

import { chatKeys } from './api.js';

/**
 * Локальное применение chat.message_sent в кэш по seq (раунд 3, «буря
 * рефечей»; канон Telegram-клиентов: событие несёт сообщение). Событие с
 * seq == последний в кэше + 1 дописывается в ленту (и +1 к счётчику корня)
 * БЕЗ рефеча — 30–40 сообщ/с отображаются поступательно, каждый своей
 * строкой, без пересборки ленты.
 *
 * Дыра в seq, отсутствие кэша, темповая оптимистичная запись (seq=0) ИЛИ
 * НЕДОПИСАННОЕ окно открытого треда → false: вызывающий инвалидирует ленту
 * (коалесцинг окон — invalidation-batcher; префикс messages(id) покрывает и
 * тред-ключи). Окно треда содержит только корень+ответы, а seq — общий по
 * беседе, поэтому непрерывность в окне треда держится не всегда: не смогли
 * дописать туда — рефеч обязателен, иначе окно молчит до попутного события
 * (замечание валидатора: «случайное исцеление — не механизм»).
 * Идентичное сообщение (своя отправка этой вкладки успела мутацией) — true:
 * тихо, без рефеча.
 */
export function applySentMessage(
  queryClient: QueryClient,
  payload: Pick<ChatMessageSentPayload, 'conversationId' | 'threadRootId' | 'message'>,
): boolean {
  const { conversationId, threadRootId, message } = payload;
  if (!message) return false;

  const listKey = chatKeys.messages(conversationId);
  const listData = queryClient.getQueryData<Paginated<ChatMessage>>(listKey);
  if (!listData) return false; // беседа не открыта — кэша нет, рефеч не нужен

  if (listData.items.some((m) => m.id === message.id)) {
    return true; // уже применено (мутация своей отправки / повтор события)
  }
  const last = listData.items[listData.items.length - 1];
  // Пустой кэш (первое сообщение открытой пустой беседы) — seq обязан быть 1.
  if (!last) {
    if (message.seq !== 1) return false;
  } else if (last.seq + 1 !== message.seq) {
    return false; // дыра или темповая запись (seq=0) — догонит рефеч
  }

  queryClient.setQueryData<Paginated<ChatMessage>>(listKey, {
    ...listData,
    items: [...listData.items, message],
  });
  if (threadRootId !== null && threadRootId !== undefined) {
    const threadAppended = applyToThreadCache(queryClient, conversationId, threadRootId, message);
    bumpRootReplies(queryClient, conversationId, threadRootId);
    if (!threadAppended) return false; // окно треда открыто, но с дырой — рефеч
  }
  return true;
}

/** Кэш окна треда (если открыт): дописать ответ; false — кэш есть, но
 *  непрерывность не сошлась (сообщение придёт инвалидацией). */
function applyToThreadCache(
  queryClient: QueryClient,
  conversationId: string,
  threadRootId: string,
  message: ChatMessage,
): boolean {
  const threadKey = chatKeys.thread(conversationId, threadRootId);
  const threadData = queryClient.getQueryData<Paginated<ChatMessage>>(threadKey);
  if (!threadData) return true; // окно не открыто — дописывать некуда, не мешаем
  if (threadData.items.some((m) => m.id === message.id)) return true;
  const last = threadData.items[threadData.items.length - 1];
  if (!last || last.seq + 1 !== message.seq) return false;
  queryClient.setQueryData<Paginated<ChatMessage>>(threadKey, {
    ...threadData,
    items: [...threadData.items, message],
  });
  return true;
}

/** Счётчик ответов корня в ленте: +1 (карточка поста обновляется до рефеча). */
function bumpRootReplies(
  queryClient: QueryClient,
  conversationId: string,
  threadRootId: string,
): void {
  const listKey = chatKeys.messages(conversationId);
  queryClient.setQueryData<Paginated<ChatMessage>>(listKey, (old) =>
    old
      ? {
          ...old,
          items: old.items.map((m) =>
            m.id === threadRootId ? { ...m, threadRepliesCount: m.threadRepliesCount + 1 } : m,
          ),
        }
      : old,
  );
}
