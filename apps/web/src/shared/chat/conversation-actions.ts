import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessage,
  ConversationListItem,
  ConversationUpdateBody,
  CreateTaskBody,
  TaskListItem,
  TaskResult,
  TaskResultCreateBody,
  ThreadWatchResult,
} from '@nodus/contracts';
import { stripMentionTokens, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { tasksKeys } from '../api/tasks-keys.js';
import { chatKeys } from './chat-keys.js';

/** Мутации беседы вне отправки: состояние беседы, «Следить» за тредом,
 *  сообщение → задача / результат задачи (#252). */

/** Состояние беседы из контекстного меню и профиля чата (ПКМ, реф Битрикс24;
 *  ревизия #211 05.10 — кнопка «Звук» в панели-профиле): закрепить / звук /
 *  «посмотреть позже» / скрыть. Оптимистично не работаем: список дешёвый,
 *  инвалидация мгновенная (I4 держим серверным ответом < 100 мс). */
export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConversationUpdateBody }) =>
      api<ConversationListItem>(`/chat/conversations/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
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

/** Поток Б: «В задачу» из сообщения чата — обычное создание задачи с
 *  происхождением (sourceMessageId: сервер проверяет доступ к сообщению и
 *  дедуплицирует — одна задача на сообщение у постановщика, #37/#252). */
export function useMessageToTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: Pick<ChatMessage, 'id' | 'text'>) => {
      const text = stripMentionTokens(message.text).trim();
      const firstLine = text.split('\n')[0]?.trim() ?? '';
      return api<TaskListItem>('/tasks', {
        method: 'POST',
        body: {
          title: (firstLine || ui.chat.toTaskUntitled).slice(0, 200),
          ...(text ? { description: text.slice(0, 5000) } : {}),
          sourceMessageId: message.id,
        } satisfies CreateTaskBody,
      });
    },
    onSuccess: () => {
      toast.success(ui.chat.toTaskDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

/** «Отметить как результат» (#252): сообщение чата задачи — новая ревизия
 *  результата (текст + ссылка на сообщение); права — на сервере. */
export function useMarkMessageAsResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      message,
    }: {
      taskId: string;
      message: Pick<ChatMessage, 'id' | 'text'>;
    }) =>
      api<TaskResult>(`/tasks/${taskId}/results`, {
        method: 'POST',
        body: {
          text: stripMentionTokens(message.text).trim().slice(0, 5000),
          messageIds: [message.id],
        } satisfies TaskResultCreateBody,
      }),
    onSuccess: () => toast.success(ui.chat.markResultDone),
    onError: () => toast.error(ui.common.saveError),
    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(vars.taskId) });
    },
  });
}
