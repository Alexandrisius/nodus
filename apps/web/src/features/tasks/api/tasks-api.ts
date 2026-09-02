import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, Paginated, TaskDetail, TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { useAuthStore } from '../../../shared/auth-store.js';
import { api } from '../../../shared/api-client.js';

export const tasksKeys = {
  all: ['tasks'] as const,
  list: () => [...tasksKeys.all, 'list'] as const,
  detail: (id: string) => [...tasksKeys.all, 'detail', id] as const,
  messages: (id: string) => [...tasksKeys.all, 'messages', id] as const,
};

export function useTasksList() {
  return useQuery({
    queryKey: tasksKeys.list(),
    queryFn: () => api<Paginated<TaskListItem>>('/tasks'),
  });
}

export function useTaskDetail(id: string) {
  return useQuery({
    queryKey: tasksKeys.detail(id),
    queryFn: () => api<TaskDetail>(`/tasks/${id}`),
  });
}

export function useTaskMessages(id: string) {
  return useQuery({
    queryKey: tasksKeys.messages(id),
    queryFn: () => api<Paginated<ChatMessage>>(`/tasks/${id}/messages`),
  });
}

/** Подзадача в один клик (I4): мгновенно в кэш детали, замена темповой на серверную. */
export function useAddSubtask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) =>
      api<TaskListItem>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } }),

    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      if (!previous) return { previous: undefined, tempId: '' };
      const temp: TaskListItem = {
        ...previous,
        id: `temp-${crypto.randomUUID()}`,
        title,
        commentsCount: 0,
        spentMinutes: 0,
        checklistDone: 0,
        checklistTotal: 0,
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), {
        ...previous,
        subtasks: [...previous.subtasks, temp],
      });
      return { previous, tempId: temp.id };
    },

    onError: (_error, _title, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.detail(taskId), context.previous);
      }
      toast.error(ui.common.sendError);
    },

    onSuccess: (server, _title, context) => {
      if (!context?.tempId) return;
      const current = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      if (!current) return;
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), {
        ...current,
        subtasks: current.subtasks.map((s) => (s.id === context.tempId ? server : s)),
      });
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
    },
  });
}

/** Оптимистичная отправка комментария (I4, канон patterns.md). */
export function useSendTaskMessage(taskId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (text: string) =>
      api<ChatMessage>(`/tasks/${taskId}/messages`, { method: 'POST', body: { text } }),

    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.messages(taskId) });
      const previous = queryClient.getQueryData<Paginated<ChatMessage>>(tasksKeys.messages(taskId));
      const temp: ChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        conversationId: taskId,
        author: { id: user?.id ?? '', displayName: user?.displayName ?? '', avatarUrl: null },
        text,
        replyToId: null,
        threadRootId: null,
        threadRepliesCount: 0,
        reactions: [],
        attachments: [],
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Paginated<ChatMessage>>(tasksKeys.messages(taskId), (old) => ({
        items: [...(old?.items ?? []), temp],
        nextCursor: old?.nextCursor ?? null,
      }));
      return { previous, tempId: temp.id };
    },

    onError: (_error, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.messages(taskId), context.previous);
      }
      toast.error(ui.common.sendError);
    },

    onSuccess: (server, _text, context) => {
      queryClient.setQueryData<Paginated<ChatMessage>>(tasksKeys.messages(taskId), (old) => ({
        items: old?.items.map((m) => (m.id === context?.tempId ? server : m)) ?? [],
        nextCursor: old?.nextCursor ?? null,
      }));
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.messages(taskId) });
    },
  });
}
