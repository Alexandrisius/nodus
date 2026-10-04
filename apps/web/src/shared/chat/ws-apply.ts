import type { QueryClient } from '@tanstack/react-query';
import type {
  ChatMessage,
  ChatMessageReadPayload,
  ChatMessageSentPayload,
  ChatReactionPayload,
  ConversationListItem,
  MessageReaction,
  Paginated,
  UserRef,
} from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
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

/** Локальное применение chat.reaction_added/removed (#124): патч массива
 *  reactions во ВСЕХ окнах кэша (лента + открытый тред — префикс ключа).
 *  Актор события = me → правка флага mine. Сообщение не в кэше (беседа не
 *  открыта) → false: вызывающий инвалидирует (рефеч и так не нужен бы, но
 *  «случайное исцеление — не механизм»: патчим только видимое). */
export function applyReactionEvent(
  queryClient: QueryClient,
  payload: Pick<ChatReactionPayload, 'conversationId' | 'messageId' | 'emoji' | 'userId'>,
  added: boolean,
): boolean {
  const meId = useAuthStore.getState().user?.id ?? null;
  // users в чипах (контракт): ref актёра — из кэша участников; нет ref —
  // не гадаем, false → вызывающий инвалидирует (рефеч принесёт users целиком).
  const reader = added
    ? readerRefFromCache(queryClient, payload.conversationId, payload.userId)
    : null;
  if (added && !reader) return false;
  let touched = false;
  queryClient.setQueriesData<Paginated<ChatMessage>>(
    { queryKey: chatKeys.messages(payload.conversationId) },
    (old) => {
      if (!old) return old;
      let hit = false;
      const items = old.items.map((m) => {
        if (m.id !== payload.messageId) return m;
        hit = true;
        return { ...m, reactions: nextReactions(m.reactions, payload, added, meId, reader) };
      });
      if (hit) touched = true;
      return hit ? { ...old, items } : old;
    },
  );
  return touched;
}

function nextReactions(
  reactions: readonly MessageReaction[],
  payload: Pick<ChatReactionPayload, 'emoji' | 'userId'>,
  added: boolean,
  meId: string | null,
  reader: UserRef | null,
): MessageReaction[] {
  const mine = payload.userId === meId;
  // users может отсутствовать в кэше от api без поля (main) — не падаем.
  const usersOf = (reaction: MessageReaction) => reaction.users ?? [];
  if (added && reader) {
    const existing = reactions.find((reaction) => reaction.emoji === payload.emoji);
    if (!existing) {
      return [...reactions, { emoji: payload.emoji, count: 1, mine, users: [reader] }];
    }
    return reactions.map((reaction) => {
      if (reaction.emoji !== payload.emoji) return reaction;
      const users = usersOf(reaction);
      // Эхо-дубль (беседа с собой: membersPreview = сам зритель, reader = актёр):
      // актёр уже в users — аппенд раздул бы count до 2 до рефеча.
      if (users.some((user) => user.id === payload.userId)) return reaction;
      return {
        ...reaction,
        users: [...users, reader],
        count: users.length + 1,
        mine: reaction.mine || mine,
      };
    });
  }
  return reactions
    .map((reaction) =>
      reaction.emoji === payload.emoji
        ? {
            ...reaction,
            users: usersOf(reaction).filter((user) => user.id !== payload.userId),
            mine: reaction.mine && !mine,
          }
        : reaction,
    )
    .map((reaction) => ({ ...reaction, count: usersOf(reaction).length }))
    .filter((reaction) => reaction.count > 0);
}

/** Локальное применение chat.message_read (#124, «шторм квитанций» аудита
 *  #123): чужое прочтение патчит readBy/readAt МОИХ сообщений ленты и
 *  открытого треда (префикс ключа) БЕЗ рефеча. Свой read — тихо (мой бейдж и
 *  точки трэдов гасит успех собственного POST /read; readBy себя не включает).
 *  Ref читателя — из membersPreview беседы в кэше списка; нет кэша/ref —
 *  false: вызывающий инвалидирует по-старому. */
export function applyReadEvent(
  queryClient: QueryClient,
  payload: Pick<ChatMessageReadPayload, 'conversationId' | 'userId' | 'upToSeq' | 'readAt'>,
): boolean {
  const meId = useAuthStore.getState().user?.id ?? null;
  if (payload.userId === meId) return true; // своё прочтение — патчить нечего
  const reader = readerRefFromCache(queryClient, payload.conversationId, payload.userId);
  if (!reader) return false;
  let touched = false;
  queryClient.setQueriesData<Paginated<ChatMessage>>(
    { queryKey: chatKeys.messages(payload.conversationId) },
    (old) => {
      if (!old) return old;
      let hit = false;
      const items = old.items.map((m) => {
        if (m.author.id !== meId || m.deletedAt !== null || m.seq > payload.upToSeq) return m;
        if (m.readBy.some((ref) => ref.id === payload.userId)) return m;
        hit = true;
        // readAt — момент ПЕРВОГО прочитавшего (min, канон #102).
        const readAt = m.readAt === null || payload.readAt < m.readAt ? payload.readAt : m.readAt;
        return { ...m, readBy: [...m.readBy, reader], readAt };
      });
      if (hit) touched = true;
      return hit ? { ...old, items } : old;
    },
  );
  return touched;
}

function readerRefFromCache(
  queryClient: QueryClient,
  conversationId: string,
  userId: string,
): UserRef | null {
  const list = queryClient.getQueryData<Paginated<ConversationListItem>>(chatKeys.conversations());
  const conversation = list?.items.find((item) => item.id === conversationId);
  return conversation?.membersPreview.find((ref) => ref.id === userId) ?? null;
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
