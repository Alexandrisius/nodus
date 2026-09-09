import { useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessage,
  Paginated,
  TaskDetail,
  TaskListItem,
  TaskStage,
  TaskStageWithCount,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { useAuthStore } from '../../../shared/auth-store.js';
import { api } from '../../../shared/api-client.js';

export const tasksKeys = {
  all: ['tasks'] as const,
  list: () => [...tasksKeys.all, 'list'] as const,
  listPages: () => [...tasksKeys.all, 'list-pages'] as const,
  stages: () => [...tasksKeys.all, 'stages'] as const,
  detail: (id: string) => [...tasksKeys.all, 'detail', id] as const,
  messages: (id: string) => [...tasksKeys.all, 'messages', id] as const,
};

/** Список (таблица с деревом): курсорные страницы по 100, подгрузка sentinel-ом
 * у dna контейнера (industry-паттерн: целиком на клиент крупные списки не
 * живут). Дерево строится из загруженного; родитель старше окна страницы
 * отображается корнем (известное ограничение до серверного lazy-дерева). */
export function useTasksPages() {
  return useInfiniteQuery({
    queryKey: tasksKeys.listPages(),
    queryFn: ({ pageParam }) =>
      api<Paginated<TaskListItem>>(
        `/tasks?view=list&limit=100${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Каталог стадий статус-схемы со счётчиками колонок (канбан-шапки). */
export function useTaskStages() {
  return useQuery({
    queryKey: tasksKeys.stages(),
    queryFn: () => api<TaskStageWithCount[]>('/tasks/stages'),
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

/** Оптимистичный перенос задачи между стадиями (канбан DnD, I4):
 * мутация в кэш до ответа сервера, откат по снапшоту при ошибке. */
export function useUpdateTaskStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, stageId, index }: { taskId: string; stageId: string; index: number }) =>
      api<TaskListItem>(`/tasks/${taskId}`, { method: 'PATCH', body: { stageId, index } }),

    onMutate: async ({ taskId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.list() });
      const previous = queryClient.getQueryData<Paginated<TaskListItem>>(tasksKeys.list());
      const previousDetail = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      const stage = queryClient
        .getQueryData<TaskStage[]>(tasksKeys.stages())
        ?.find((s) => s.id === stageId);
      queryClient.setQueryData<Paginated<TaskListItem>>(tasksKeys.list(), (old) => {
        if (!old || !stage) return old;
        return {
          ...old,
          items: old.items.map((t) =>
            t.id === taskId ? { ...t, stage, updatedAt: new Date().toISOString() } : t,
          ),
        };
      });
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), (old) =>
        old && stage ? { ...old, stage, updatedAt: new Date().toISOString() } : old,
      );
      return { previous, previousDetail };
    },

    onError: (_error, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.list(), context.previous);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(tasksKeys.detail(vars.taskId), context.previousDetail);
      }
      toast.error(ui.tasks.stageMoveError);
    },

    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.list() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(vars.taskId) });
    },
  });
}

/** Префетч детали и обсуждения по ховеру строки/карточки: первое открытие
 *  слайдера рендерит контент одним проходом (без скелетон-релэйаута) —
 *  первая анимация не платит холодный fetch. */
export function usePrefetchTask() {
  const queryClient = useQueryClient();
  return useCallback(
    (taskId: string) => {
      void queryClient.prefetchQuery({
        queryKey: tasksKeys.detail(taskId),
        queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
      });
      void queryClient.prefetchQuery({
        queryKey: tasksKeys.messages(taskId),
        queryFn: () => api<Paginated<ChatMessage>>(`/tasks/${taskId}/messages`),
      });
    },
    [queryClient],
  );
}

/** Поиск задач (палитра Ctrl+K): серверный фильтр по титулу/номеру —
 * industry-паттерн: клиент не держит весь список ради поиска. */
export function useTasksSearch(q: string) {
  return useQuery({
    queryKey: [...tasksKeys.all, 'search', q] as const,
    queryFn: () => api<Paginated<TaskListItem>>(`/tasks?search=${encodeURIComponent(q)}&limit=20`),
    enabled: q.length > 0,
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
        parentId: taskId,
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
