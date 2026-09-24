import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessage,
  ConversationListItem,
  MessageAttachment,
  Paginated,
  ReplyPreview,
  TaskListItem,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { tasksKeys } from '../api/tasks-keys.js';
import { useAuthStore } from '../auth-store.js';

/**
 * API-слой чата в shared (два потребителя — мессенджер и вкладка «Чат»
 * панели проекта; I6: фичи друг друга не импортируют). Ключи — единая
 * фабрика: инвалидации пересекают границы потребителей.
 */
export const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  messages: (id: string) => [...chatKeys.all, 'messages', id] as const,
  thread: (id: string, rootId: string) =>
    [...chatKeys.all, 'messages', id, 'thread', rootId] as const,
  /** Закрепы беседы (A3): лента закрепов снапшотами. */
  pins: (id: string) => [...chatKeys.all, 'pins', id] as const,
  /** Личка с пользователем (открыть/создать direct по сотруднику). */
  direct: (userId: string) => [...chatKeys.conversations(), 'direct', userId] as const,
};

export function useConversationMessages(id: string) {
  return useQuery({
    queryKey: chatKeys.messages(id),
    queryFn: () => api<Paginated<ChatMessage>>(`/chat/conversations/${id}/messages`),
    enabled: id.length > 0,
  });
}

/** Список бесед мессенджера (переехал в shared, #87: диалог пересылки —
 *  shared-слой; features/chat/api/chat-api.ts реэкспортирует). */
export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => api<Paginated<ConversationListItem>>('/chat/conversations'),
  });
}

/** Тред канала: корневое сообщение + ответы (ровно один уровень). */
export function useThreadMessages(conversationId: string, threadRootId: string) {
  return useQuery({
    queryKey: chatKeys.thread(conversationId, threadRootId),
    queryFn: () =>
      api<Paginated<ChatMessage>>(
        `/chat/conversations/${conversationId}/messages?threadRootId=${threadRootId}`,
      ),
    enabled: conversationId.length > 0 && threadRootId.length > 0,
  });
}

/** Поток Б: «В задачу» из сообщения чата. */
export function useMessageToTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: { conversationId: string; messageId: string }) =>
      api<TaskListItem>(
        `/chat/conversations/${target.conversationId}/messages/${target.messageId}/to-task`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      toast.success(ui.chat.toTaskDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

/** Личный диалог с сотрудником (карточка сотрудника — чат всегда справа):
 *  find-or-create на стороне API, клиент читает как query. */
export function useDirectConversation(userId: string) {
  return useQuery({
    queryKey: chatKeys.direct(userId),
    queryFn: () => api<ConversationListItem>(`/chat/conversations/direct/${userId}`),
    enabled: userId.length > 0,
  });
}

/** Оптимистичная отправка (I4): мгновенно в кэш ленты/треда, откат при
 *  ошибке. Ответ в тред дополнительно инкрементирует счётчик корня в кэше
 *  ленты (карточка треда обновляется до ответа сервера). Payload линии A
 *  (#87): вложения (attachmentIds + превью для temp-сообщения), ответ-цитата
 *  (replyToId/quoteText + клиентский снапшот для temp). */
export interface SendChatVars {
  text: string;
  threadRootId?: string | null;
  replyToId?: string | null;
  quoteText?: string | null;
  attachmentIds?: string[];
  /** Превью для оптимистичного temp-сообщения (готовые загрузки/цитата). */
  attachments?: MessageAttachment[];
  reply?: ReplyPreview | null;
}

export function useSendChatMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (vars: SendChatVars) =>
      api<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: {
          text: vars.text,
          attachmentIds: vars.attachmentIds,
          replyToId: vars.replyToId ?? null,
          quoteText: vars.quoteText ?? null,
          threadRootId: vars.threadRootId ?? null,
        },
      }),

    onMutate: async (vars) => {
      const listKey = chatKeys.messages(conversationId);
      const threadKey = vars.threadRootId
        ? chatKeys.thread(conversationId, vars.threadRootId)
        : listKey;
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previousList = queryClient.getQueryData<Paginated<ChatMessage>>(listKey);
      const previousThread = vars.threadRootId
        ? queryClient.getQueryData<Paginated<ChatMessage>>(threadKey)
        : undefined;

      const temp: ChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        conversationId,
        author: { id: user?.id ?? '', displayName: user?.displayName ?? '', avatarUrl: null },
        text: vars.text,
        replyToId: vars.replyToId ?? null,
        reply: vars.reply ?? null,
        deletedAt: null,
        pinned: false,
        forwardedFrom: null,
        threadRootId: vars.threadRootId ?? null,
        threadRepliesCount: 0,
        reactions: [],
        attachments: vars.attachments ?? [],
        editedAt: null,
        readAt: null,
        createdAt: new Date().toISOString(),
      };

      if (vars.threadRootId) {
        // Ответ виден в треде сразу; счётчик корня в ленте — тоже.
        queryClient.setQueryData<Paginated<ChatMessage>>(threadKey, (old) => ({
          items: [...(old?.items ?? []), temp],
          nextCursor: old?.nextCursor ?? null,
        }));
        queryClient.setQueryData<Paginated<ChatMessage>>(listKey, (old) =>
          old
            ? {
                ...old,
                items: old.items.map((m) =>
                  m.id === vars.threadRootId
                    ? { ...m, threadRepliesCount: m.threadRepliesCount + 1 }
                    : m,
                ),
              }
            : old,
        );
      } else {
        queryClient.setQueryData<Paginated<ChatMessage>>(listKey, (old) => ({
          items: [...(old?.items ?? []), temp],
          nextCursor: old?.nextCursor ?? null,
        }));
      }
      return { previousList, previousThread, threadKey, tempId: temp.id };
    },

    onError: (_error, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(chatKeys.messages(conversationId), context.previousList);
      }
      if (context?.previousThread && context.threadKey) {
        queryClient.setQueryData(context.threadKey, context.previousThread);
      }
      toast.error(ui.common.sendError);
    },

    onSuccess: (server, _vars, context) => {
      // Темповая запись заменяется серверной в том же кэше (лента или тред).
      queryClient.setQueryData<Paginated<ChatMessage>>(context?.threadKey, (old) =>
        old
          ? {
              items: old.items.map((m) => (m.id === context?.tempId ? server : m)),
              nextCursor: old.nextCursor,
            }
          : old,
      );
      // Собеседник «прочитывает» сообщение спустя пару секунд (мокап): одна
      // отложенная инвалидация переключает галочки sent→read без polling.
      // Удаляется ВМЕСТЕ с мок-логикой read-receipt при подключении бэкенда:
      // прочтение придёт событием WS message.read, таймер не нужен (аудит
      // #45: таймер без clear — при размонтировании инвалидация уходила бы
      // в неактуальный ключ; терпимо до API, не тащим в прод).
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      }, 2500);
    },

    onSettled: () => {
      // Префикс messages(id) покрывает и тред-ключи (prefix matching).
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}
