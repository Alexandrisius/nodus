import { useCallback } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ChatMessage,
  Paginated,
  TaskBranch,
  TaskDetail,
  TaskListItem,
  TaskRelation,
  TaskStage,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { useAuthStore } from '../../../shared/auth-store.js';
import { api } from '../../../shared/api-client.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';

// Ключи кэша — canonical в shared/api/tasks-keys (общие компоненты создания
// в shared/tasks тоже ими пользуются); реэкспорт для потребителей фичи.
export { tasksKeys } from '../../../shared/api/tasks-keys.js';

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

/** Ветка задачи для панели-навигатора: дерево от корневого предка. */
export function useTaskBranch(id: string) {
  return useQuery({
    queryKey: tasksKeys.branch(id),
    queryFn: () => api<TaskBranch>(`/tasks/${id}/branch`),
  });
}

/** Связи задачи (поле «Отношения», вкладка «Связи» навигатора) — заготовка
 *  под зависимости Ганта (#39); пока список пуст. */
export function useTaskRelations(id: string) {
  return useQuery({
    queryKey: tasksKeys.relations(id),
    queryFn: () => api<Paginated<TaskRelation>>(`/tasks/${id}/relations`),
  });
}

export function useTaskDetail(id: string) {
  return useQuery({
    queryKey: tasksKeys.detail(id),
    queryFn: () => api<TaskDetail>(`/tasks/${id}`),
    // Смена задачи в навигаторе ветки: прежний контент остаётся, пока грузится
    // новый — карточка не мигает скелетоном (плавность, I4).
    placeholderData: keepPreviousData,
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

/** Подзадача произвольному родителю из навигатора ветки: без оптимистичного
 *  темпа в кэше детали (родитель может быть не открыт), дерево и деталь
 *  инвалидируются по завершении. */
export function useAddSubtaskTo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, title }: { parentId: string; title: string }) =>
      api<TaskListItem>(`/tasks/${parentId}/subtasks`, { method: 'POST', body: { title } }),
    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(vars.parentId) });
      void queryClient.invalidateQueries({ queryKey: [...tasksKeys.all, 'branch'] });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
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
        readAt: null,
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
