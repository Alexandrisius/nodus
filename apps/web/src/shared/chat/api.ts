import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessage,
  ConversationListItem,
  MessageAttachment,
  Paginated,
  ReplyPreview,
  TaskListItem,
  ThreadStateList,
  ThreadWatchResult,
  UrgentPolicy,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { isDomainMocked } from '../api/api-mock-config.js';
import { tasksKeys } from '../api/tasks-keys.js';
import { useAuthStore } from '../auth-store.js';
import { useChatDrafts } from './chat-drafts.js';
import { composerSendErrorCode, useComposerErrors } from './composer-errors.js';
import { useSocketStatusStore } from '../socket/socket-status-store.js';

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
  /** Состояния трэдов для текущего пользователя (раунд 3: точка «есть новые»
   *  на посте, кнопка «Следить»); под префиксом messages(id) НЕ живёт —
   *  инвалидация ленты его не трогает. */
  threadStates: (id: string) => [...chatKeys.all, 'threadStates', id] as const,
  /** Личка с пользователем (открыть/создать direct по сотруднику). */
  direct: (userId: string) => [...chatKeys.conversations(), 'direct', userId] as const,
  /** Участники беседы (#186): панель с ролями; search — часть ключа. */
  members: (id: string) => [...chatKeys.all, 'members', id] as const,
  /** Политика важных (#177): счётчик дневного лимита попапа молнии. */
  urgentPolicy: () => [...chatKeys.all, 'urgentPolicy'] as const,
};

/** Политика дневного лимита важных (#177): remaining/limit/resetAt/groupMax.
 *  Опрос — при ОТКРЫТИИ попапа молнии (staleTime короткий: за сутки лимит
 *  меняется только отправками самого пользователя); на маунте композера
 *  запроса НЕТ (лишний фетч на каждую беседу). */
export function useUrgentPolicy(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.urgentPolicy(),
    queryFn: () => api<UrgentPolicy>('/chat/urgent/policy'),
    enabled,
    staleTime: 30_000,
  });
}

/** Императивный догруз политики (guardrail перед отправкой requireAck:
 *  кэш общий с useUrgentPolicy — если счётчик уже открыт, запроса нет). */
export function fetchUrgentPolicy(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.fetchQuery({
    queryKey: chatKeys.urgentPolicy(),
    queryFn: () => api<UrgentPolicy>('/chat/urgent/policy'),
    staleTime: 30_000,
  });
}

/** Живой чат: до WS-шлюза (#48) ленты опрашивались часто (5/10 с); с #104
 *  основной путь — WS-события → инвалидации, опрос остаётся fallback:
 *  редкий при живом сокете (60 с), частый — без него (разрыв). В мок-режиме
 *  поллинг не нужен — данные статичны; фоновые табы не опрашиваются. */
const LIVE_CHAT_POLL = { conversations: 10_000, messages: 5_000 } as const;
const SOCKET_POLL_FALLBACK_MS = 60_000;

function livePoll(intervalMs: number, socketConnected: boolean): number | false {
  if (isDomainMocked('chat')) return false;
  return socketConnected ? SOCKET_POLL_FALLBACK_MS : intervalMs;
}

export function useConversationMessages(id: string) {
  const socketConnected = useSocketStatusStore((s) => s.connected);
  return useQuery({
    queryKey: chatKeys.messages(id),
    // limit=100 — максимум контракта (раунд 4: страница 50 резала историю,
    // «старые сообщения пропадали»; полноценная догрузка при прокрутке — #117).
    queryFn: () => api<Paginated<ChatMessage>>(`/chat/conversations/${id}/messages?limit=100`),
    enabled: id.length > 0,
    refetchInterval: livePoll(LIVE_CHAT_POLL.messages, socketConnected),
    refetchIntervalInBackground: false,
  });
}

/** Список бесед мессенджера (переехал в shared, #87: диалог пересылки —
 *  shared-слой; features/chat/api/chat-api.ts реэкспортирует). */
export function useConversations() {
  const socketConnected = useSocketStatusStore((s) => s.connected);
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => api<Paginated<ConversationListItem>>('/chat/conversations'),
    refetchInterval: livePoll(LIVE_CHAT_POLL.conversations, socketConnected),
    refetchIntervalInBackground: false,
  });
}

/** Тред канала: корневое сообщение + ответы (ровно один уровень). */
export function useThreadMessages(conversationId: string, threadRootId: string) {
  const socketConnected = useSocketStatusStore((s) => s.connected);
  return useQuery({
    queryKey: chatKeys.thread(conversationId, threadRootId),
    queryFn: () =>
      api<Paginated<ChatMessage>>(
        `/chat/conversations/${conversationId}/messages?threadRootId=${threadRootId}&limit=100`,
      ),
    enabled: conversationId.length > 0 && threadRootId.length > 0,
    refetchInterval: livePoll(LIVE_CHAT_POLL.messages, socketConnected),
    refetchIntervalInBackground: false,
  });
}

/** Состояния трэдов для текущего пользователя (раунд 3): карта rootId →
 *  { watched, unreadCount } — точка «есть новые» на счётчике ответов поста
 *  и состояние кнопки «Следить» в шапке окна треда. */
export function useThreadStates(conversationId: string) {
  const socketConnected = useSocketStatusStore((s) => s.connected);
  return useQuery({
    queryKey: chatKeys.threadStates(conversationId),
    queryFn: () => api<ThreadStateList>(`/chat/conversations/${conversationId}/threads/state`),
    select: (data) => new Map(data.items.map((s) => [s.threadRootId, s])),
    enabled: conversationId.length > 0,
    refetchInterval: livePoll(LIVE_CHAT_POLL.conversations, socketConnected),
    refetchIntervalInBackground: false,
  });
}

/** Кнопка «Следить/Перестать» в шапке окна треда (toggle, идемпотентный). */
export function useWatchThread(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadRootId: string) =>
      api<ThreadWatchResult>(
        `/chat/conversations/${conversationId}/threads/${threadRootId}/watch`,
        { method: 'POST' },
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.threadStates(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
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
  /** Стикер-отправка (#143): id стикера из пака; превью-вложение — в
   *  attachments (kind='sticker' с метаданными пака). */
  stickerId?: string;
  /** Стикер не съедает черновик композера (набранный текст остаётся). */
  keepDraft?: boolean;
  /** Превью для оптимистичного temp-сообщения (готовые загрузки/цитата). */
  attachments?: MessageAttachment[];
  reply?: ReplyPreview | null;
  /** «Важное» (#177): флаг летит в тело отправки и в оптимистичный
   *  temp-пузырь (бордер/чип видны сразу, I4). */
  urgent?: boolean;
  /** Ключ идемпотентности = id оптимистичной записи (#48). Обычно НЕ передают:
   *  mutate генерирует temp id на отправку; явно — в тестах и для повторов
   *  ТОГО ЖЕ логического сообщения (двойной клик/ретрай после потери ответа
   *  сойдутся на сервере в одну строку, client_message_id). */
  tempId?: string;
}

interface SendChatMutationVars extends SendChatVars {
  tempId: string;
}

export function useSendChatMessage(conversationId: string, draftScope?: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const mutation = useMutation({
    mutationFn: (vars: SendChatMutationVars) =>
      api<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        // Идемпотентность (#48): ключ = temp id оптимистичной записи —
        // и повтор той же мутации, и прозрачный refresh внутри api()
        // идут с ОДНИМ ключом (по умолчанию ключ — на вызов api()).
        idempotencyKey: vars.tempId,
        body: {
          text: vars.text,
          attachmentIds: vars.attachmentIds,
          stickerId: vars.stickerId,
          replyToId: vars.replyToId ?? null,
          quoteText: vars.quoteText ?? null,
          threadRootId: vars.threadRootId ?? null,
          urgent: vars.urgent,
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
        id: vars.tempId,
        conversationId,
        seq: 0, // плейсхолдер: реальный seq придёт с ответом сервера
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
        readBy: [],
        // Оптимистичный пузырь важного (#177): бордер/чип видны сразу (I4).
        urgent: vars.urgent ?? false,
        mentionedUserIds: [],
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
      // Новая попытка отправки гасит инлайн-ошибку предыдущей (#177).
      if (draftScope) useComposerErrors.getState().clear(draftScope);
      return { previousList, previousThread, threadKey, tempId: temp.id };
    },

    onError: (error, vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(chatKeys.messages(conversationId), context.previousList);
      }
      if (context?.previousThread && context.threadKey) {
        queryClient.setQueryData(context.threadKey, context.previousThread);
      }
      // 409 политики важных (#177) — инлайн в композере (рядом с молнией),
      // прочие ошибки — штатный тост. Текст при этом НЕ теряется (#124).
      const inlineCode = composerSendErrorCode(error);
      if (inlineCode && draftScope) {
        useComposerErrors.getState().set(draftScope, inlineCode);
        return;
      }
      void vars;
      toast.error(ui.common.sendError);
    },

    onSuccess: (server, vars, context) => {
      // Черновик чистится ТОЛЬКО по успеху (#124, аудит #123): при ошибке
      // сети набранный текст остаётся в композере (retry тем же ключом
      // идемпотентности). Скоуп знает хост (conversation/feed/thread).
      // Стикер-отправка черновик не трогает (keepDraft, #143).
      if (draftScope && !vars.keepDraft) useChatDrafts.getState().clear(draftScope);
      // Темповая запись заменяется серверной в том же кэше (лента или тред).
      queryClient.setQueryData<Paginated<ChatMessage>>(context?.threadKey, (old) =>
        old
          ? {
              items: old.items.map((m) => (m.id === context?.tempId ? server : m)),
              nextCursor: old.nextCursor,
            }
          : old,
      );
      // МОК-симуляция просмотров (#102 р.2) переехала с отправки на КВИТАНЦИЮ
      // просмотра (use-viewport-read.ts): собеседник «просматривает» видимое
      // по мере прокрутки — отложенный рефеч после собственной квитанции.
    },

    onSettled: () => {
      // Префикс messages(id) покрывает и тред-ключи (prefix matching).
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      // Заряды молнии (#177): счётчик обновляется сразу после отправки,
      // не по 30-секундному staleTime.
      void queryClient.invalidateQueries({ queryKey: chatKeys.urgentPolicy() });
    },
  });

  /** Отправка с temp id (#48): одна отправка = один temp id = один ключ
   *  идемпотентности на все повторы этого сообщения. */
  function mutate(vars: SendChatVars): void {
    mutation.mutate({ ...vars, tempId: vars.tempId ?? crypto.randomUUID() });
  }

  /** То же с исходом вызова (#144): окно отправки вложений держит кнопку
   *  нажатой до ответа и переживает сетевую ошибку с повтором. */
  function mutateAsync(vars: SendChatVars): Promise<ChatMessage> {
    return mutation.mutateAsync({ ...vars, tempId: vars.tempId ?? crypto.randomUUID() });
  }

  return { ...mutation, mutate, mutateAsync };
}
