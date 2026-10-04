import type {
  BatchDeleteMessagesResult,
  ChatMessage,
  ForwardMessagesBody,
  MessagePin,
  MessageReaction,
  Paginated,
  UserRef,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { useAuthStore } from '../auth-store.js';
import { chatKeys } from './api.js';
import { useChatDrafts } from './chat-drafts.js';
import type { EditMessageVars } from './message-edit.js';
import { useScrollEndStore } from './scroll-end-store.js';

/**
 * Мутации сообщений линии A (#87): правка, удаление (одиночное/пакетное),
 * закрепы, пересылка. Единый оптимистичный паттерн (I4, patterns.md):
 * cancelQueries → снапшот → setQueriesData; откат по снапшоту; серверная
 * версия — истина в последней инстанции (onSuccess заменяет прогноз).
 * Ключ messages(conversationId) префиксом покрывает и тред-кеши —
 * одна трансформация правит ленту и окно треда одновременно.
 */

function mapMessage(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
  fn: (message: ChatMessage) => ChatMessage | null,
): void {
  qc.setQueriesData<Paginated<ChatMessage>>(
    { queryKey: chatKeys.messages(conversationId) },
    (old) => {
      if (!old) return old;
      let touched = false;
      const items = old.items.flatMap((m) => {
        if (m.id !== messageId) return [m];
        touched = true;
        const next = fn(m);
        return next ? [next] : [];
      });
      return touched ? { ...old, items } : old;
    },
  );
}

/** Серверная истина после оптимистичного прогноза: заменить запись, а если
 *  её уже убрали из кэша (прогноз «без следа» разошёлся с сервером) — вернуть
 *  в конец ленты (позиция утрачена; рассинхрон досоздаст invalidate). */
function upsertMessage(qc: QueryClient, conversationId: string, message: ChatMessage): void {
  let found = false;
  qc.setQueriesData<Paginated<ChatMessage>>(
    { queryKey: chatKeys.messages(conversationId) },
    (old) => {
      if (!old) return old;
      let touched = false;
      const items = old.items.map((m) => {
        if (m.id !== message.id) return m;
        touched = true;
        return message;
      });
      if (touched) found = true;
      return touched ? { ...old, items } : old;
    },
  );
  if (!found) {
    qc.setQueryData<Paginated<ChatMessage>>(chatKeys.messages(conversationId), (old) =>
      old ? { ...old, items: [...old.items, message] } : { items: [message], nextCursor: null },
    );
  }
}

function findCached(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
): ChatMessage | undefined {
  const caches = qc.getQueriesData<Paginated<ChatMessage>>({
    queryKey: chatKeys.messages(conversationId),
  });
  for (const [, data] of caches) {
    const found = data?.items.find((m) => m.id === messageId);
    if (found) return found;
  }
  return undefined;
}

/** Локальный прогноз надгробия (правило следа сервер подтвердит/опровергнет). */
function predictTombstone(m: ChatMessage): ChatMessage {
  return {
    ...m,
    text: '',
    attachments: [],
    reactions: [],
    reply: null,
    pinned: false,
    deletedAt: new Date().toISOString(),
  };
}

/** Прогноз «есть живые ответы» по кэшу (#163, правило следа «по ответам»):
 *  ответ (reply.id) или пост треда (threadRootId = цель), не удалённые.
 *  Кэш — окно ленты/тредов: ответ вне окна прогноз врёт — истину ставит
 *  реконсиляция по ответу сервера (204/200) и инвалидация. */
export function cachedHasLiveReplies(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
): boolean {
  const caches = qc.getQueriesData<Paginated<ChatMessage>>({
    queryKey: chatKeys.messages(conversationId),
  });
  for (const [, data] of caches) {
    for (const m of data?.items ?? []) {
      if (m.id === messageId || m.deletedAt !== null) continue;
      if (m.reply?.id === messageId || m.threadRootId === messageId) return true;
    }
  }
  return false;
}

type CacheSnapshot = [readonly unknown[], unknown][];

function snapshotMessages(qc: QueryClient, conversationId: string): CacheSnapshot {
  return qc.getQueriesData({ queryKey: chatKeys.messages(conversationId) });
}

function restoreSnapshot(qc: QueryClient, snapshot: CacheSnapshot): void {
  for (const [key, data] of snapshot) {
    qc.setQueryData(key as readonly unknown[], data);
  }
}

export function useEditMessage(conversationId: string, draftScope?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: EditMessageVars) =>
      api<ChatMessage>(`/chat/conversations/${conversationId}/messages/${vars.messageId}`, {
        method: 'PATCH',
        body: {
          text: vars.text,
          // attachmentIds есть = полный итоговый состав из окна правки
          // (#188); отсутствует = инлайн-правка текста, состав не трогаем.
          ...(vars.attachmentIds !== undefined ? { attachmentIds: vars.attachmentIds } : {}),
          ...(vars.attachmentRenames !== undefined
            ? { attachmentRenames: vars.attachmentRenames }
            : {}),
        },
      }),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
      const snapshot = snapshotMessages(qc, conversationId);
      // «Повторный пуш прочитавшим» (решение #41): editedAt + сброс readAt —
      // галочки read→sent видны сразу (модель поведения до WS M13). Состав
      // вложений (#188): окно дало оптимистичный список — применяем ДО
      // ответа сервера (I4).
      mapMessage(qc, conversationId, vars.messageId, (m) => ({
        ...m,
        text: vars.text,
        editedAt: new Date().toISOString(),
        readAt: null,
        ...(vars.optimisticAttachments !== undefined
          ? { attachments: vars.optimisticAttachments }
          : {}),
      }));
      return { snapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast.error(ui.common.saveError);
    },

    onSuccess: (server, vars) => {
      mapMessage(qc, conversationId, vars.messageId, () => server);
      // Правка применена — режим правки выходим по успеху (#124): до ответа
      // сервера текст остаётся в композере (ошибка не теряет правку).
      if (draftScope) useChatDrafts.getState().finishEdit(draftScope);
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      void qc.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
    },
  });
}

/** Удаление: conversationId — В ПЕРЕМЕННЫХ мутации, не в замыкании хука.
 *  Хост диалога закрывается сразу после mutate() (request → null), и TanStack
 *  берёт mutationFn из опций ПОСЛЕДНЕГО рендера — замыкание с пустым id
 *  давало DELETE /conversations//messages/… 404 (баг скриншот-прогона 24.09). */
export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    /** 204 — живых ответов нет (бесследно); 200 + надгробие — есть ответы. */
    mutationFn: (vars: { conversationId: string; messageId: string }) =>
      api<ChatMessage | undefined>(
        `/chat/conversations/${vars.conversationId}/messages/${vars.messageId}`,
        { method: 'DELETE' },
      ),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(vars.conversationId) });
      const snapshot = snapshotMessages(qc, vars.conversationId);
      mapMessage(qc, vars.conversationId, vars.messageId, (m) =>
        cachedHasLiveReplies(qc, vars.conversationId, vars.messageId) ? predictTombstone(m) : null,
      );
      return { snapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast.error(ui.common.saveError);
    },

    onSuccess: (server, vars) => {
      if (server) upsertMessage(qc, vars.conversationId, server);
    },

    onSettled: (_data, _error, vars) => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(vars.conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      void qc.invalidateQueries({ queryKey: chatKeys.pins(vars.conversationId) });
    },
  });
}

export function useBatchDeleteMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { conversationId: string; messageIds: string[] }) =>
      api<BatchDeleteMessagesResult>(
        `/chat/conversations/${vars.conversationId}/messages/batch-delete`,
        { method: 'POST', body: { messageIds: vars.messageIds } },
      ),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(vars.conversationId) });
      const snapshot = snapshotMessages(qc, vars.conversationId);
      for (const id of vars.messageIds) {
        mapMessage(qc, vars.conversationId, id, (m) =>
          cachedHasLiveReplies(qc, vars.conversationId, id) ? predictTombstone(m) : null,
        );
      }
      return { snapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast.error(ui.common.saveError);
    },

    onSuccess: (result, vars) => {
      // Сервер — истина: прогноз (по кэшу окна) может разойтись с ответами
      // вне загруженного окна.
      for (const id of result.removed) mapMessage(qc, vars.conversationId, id, () => null);
      for (const tombstone of result.tombstones) {
        upsertMessage(qc, vars.conversationId, tombstone);
      }
    },

    onSettled: (_data, _error, vars) => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(vars.conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      void qc.invalidateQueries({ queryKey: chatKeys.pins(vars.conversationId) });
    },
  });
}

export function usePins(conversationId: string) {
  return useQuery({
    queryKey: chatKeys.pins(conversationId),
    queryFn: () => api<Paginated<MessagePin>>(`/chat/conversations/${conversationId}/pins`),
    select: (data) => data.items,
    enabled: conversationId.length > 0,
  });
}

/** Закреп/открепление (A3): оптимистично в пин-кэше и в ленте (флаг pinned).
 *  Открепление — с undo-тостом (случайный клик по × не теряет закреп). */
export function usePinToggle(conversationId: string) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  const pin = useMutation({
    mutationFn: (messageId: string) =>
      api<MessagePin>(`/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
        method: 'POST',
      }),

    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: chatKeys.pins(conversationId) });
      const pinsSnapshot = qc.getQueryData(chatKeys.pins(conversationId));
      const messagesSnapshot = snapshotMessages(qc, conversationId);
      const cached = findCached(qc, conversationId, messageId);
      if (cached && me) {
        const optimistic: MessagePin = {
          message: { ...cached, pinned: true },
          // AuthUser без avatarUrl (контракт) — PersonAvatar рисует инициалы.
          pinnedBy: { id: me.id, displayName: me.displayName, avatarUrl: null },
          pinnedAt: new Date().toISOString(),
        };
        qc.setQueryData<Paginated<MessagePin>>(chatKeys.pins(conversationId), (old) => ({
          items: [optimistic, ...(old?.items ?? [])],
          nextCursor: old?.nextCursor ?? null,
        }));
      }
      mapMessage(qc, conversationId, messageId, (m) => ({ ...m, pinned: true }));
      return { pinsSnapshot, messagesSnapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) {
        qc.setQueryData(chatKeys.pins(conversationId), context.pinsSnapshot);
        restoreSnapshot(qc, context.messagesSnapshot);
      }
      toast.error(ui.common.saveError);
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });

  const unpin = useMutation({
    mutationFn: (messageId: string) =>
      api<void>(`/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
        method: 'DELETE',
      }),

    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: chatKeys.pins(conversationId) });
      const pinsSnapshot = qc.getQueryData(chatKeys.pins(conversationId));
      const messagesSnapshot = snapshotMessages(qc, conversationId);
      qc.setQueryData<Paginated<MessagePin>>(chatKeys.pins(conversationId), (old) =>
        old ? { ...old, items: old.items.filter((p) => p.message.id !== messageId) } : old,
      );
      mapMessage(qc, conversationId, messageId, (m) => ({ ...m, pinned: false }));
      return { pinsSnapshot, messagesSnapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) {
        qc.setQueryData(chatKeys.pins(conversationId), context.pinsSnapshot);
        restoreSnapshot(qc, context.messagesSnapshot);
      }
      toast.error(ui.common.saveError);
    },

    // Без тоста: открепление идёт через диалог подтверждения (вердикт
    // 24.09) — он и есть страховка от случайного клика.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });

  return { pin, unpin };
}

/** Оптимистичный прогноз массива реакций (#124): remove своей — уход из users
 *  и исчезновение чипа на нуле; add — вход в users или новый чип с mine:true
 *  (инвариант контракта: count === users.length). Повторный клик по своей —
 *  no-op (прогноз ничего не меняет). */
export function predictReactions(
  message: ChatMessage,
  emoji: string,
  remove: boolean,
  me: UserRef | null,
): MessageReaction[] {
  const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
  // users может отсутствовать в кэше от api без поля (main) — не падаем.
  const usersOf = (reaction: MessageReaction) => reaction.users ?? [];
  if (remove) {
    return message.reactions
      .map((reaction) =>
        reaction.emoji === emoji
          ? {
              ...reaction,
              users: me ? usersOf(reaction).filter((user) => user.id !== me.id) : usersOf(reaction),
              mine: false,
            }
          : reaction,
      )
      .map((reaction) => ({ ...reaction, count: usersOf(reaction).length }))
      .filter((reaction) => reaction.count > 0);
  }
  if (existing) {
    if (existing.mine) return message.reactions;
    return message.reactions.map((reaction) =>
      reaction.emoji === emoji
        ? {
            ...reaction,
            users: me ? [...usersOf(reaction), me] : usersOf(reaction),
            count: usersOf(reaction).length + (me ? 1 : 0),
            mine: true,
          }
        : reaction,
    );
  }
  return [...message.reactions, { emoji, count: me ? 1 : 0, mine: true, users: me ? [me] : [] }];
}

/** Реакции (#124): toggle своей реакции — ховер-попап и клик по чипу.
 *  Оптимистичность по канону файла; серверный DTO — истина (onSuccess). */
export function useReactionToggle(conversationId: string) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  // AuthUser без avatarUrl (контракт) — PersonAvatar рисует инициалы.
  const meRef: UserRef | null = me
    ? { id: me.id, displayName: me.displayName, avatarUrl: null }
    : null;
  return useMutation({
    mutationFn: (vars: { messageId: string; emoji: string; remove: boolean }) =>
      api<ChatMessage>(
        `/chat/conversations/${conversationId}/messages/${vars.messageId}/reactions`,
        { method: 'POST', body: { emoji: vars.emoji, remove: vars.remove } },
      ),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
      const snapshot = snapshotMessages(qc, conversationId);
      mapMessage(qc, conversationId, vars.messageId, (m) => ({
        ...m,
        reactions: predictReactions(m, vars.emoji, vars.remove, meRef),
      }));
      return { snapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast.error(ui.common.saveError);
    },

    onSuccess: (server, vars) => {
      mapMessage(qc, conversationId, vars.messageId, () => server);
    },

    // Реакций нет в списке бесед — инвалидируется только messages-префикс
    // (окно треда покрыто префиксом).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });
}

export function useForwardMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { targetId: string; body: ForwardMessagesBody }) =>
      api<ChatMessage[]>(`/chat/conversations/${vars.targetId}/forward`, {
        method: 'POST',
        body: vars.body,
      }),

    onSuccess: (_created, vars) => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(vars.targetId) });
      void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      // Догон ленты приёмника к низу для отправителя (раунд 4): батч из
      // мультиселекта идёт через эту мутацию МИМО композера (у одиночной
      // пересылки догон просит композер) — без запроса отправитель оставался
      // без прокрутки к своему новому сообщению (вердикт раунда 4).
      const scope = vars.body.threadRootId
        ? `thread:${vars.body.threadRootId}`
        : `conversation:${vars.targetId}`;
      useScrollEndStore.getState().request(scope, 'smooth');
      // Тостов здесь нет: пересылка одиночная (вердикт 24.09); тост успеха —
      // в композере-инициаторе (chat-composer).
    },

    onError: () => {
      toast.error(ui.common.sendError);
    },
  });
}
