import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PersonalStageCreateBody,
  PersonalStageUpdateBody,
  TaskDetail,
  TaskListItem,
  TaskStage,
  TaskStageWithCount,
  Paginated,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { tasksKeys } from './tasks-api.js';

/** Личная схема «Мой план» (ADR-0008): колонки личной доски со счётчиками. */
export function usePersonalStages() {
  return useQuery({
    queryKey: tasksKeys.personalStages(),
    queryFn: () => api<TaskStageWithCount[]>('/tasks/personal-stages'),
  });
}

/** Оптимистичный перенос по ЛИЧНОЙ оси «Мой план» (ADR-0008): глобальная
 *  стадия задачи не меняется; в кэшах — personalStageId до ответа сервера. */
export function useUpdateTaskPersonalStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      personalStageId,
      index,
    }: {
      taskId: string;
      personalStageId: string;
      index: number;
    }) =>
      api<TaskListItem>(`/tasks/${taskId}`, { method: 'PATCH', body: { personalStageId, index } }),

    onMutate: async ({ taskId, personalStageId }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.list() });
      const previous = queryClient.getQueryData<Paginated<TaskListItem>>(tasksKeys.list());
      const previousDetail = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      queryClient.setQueryData<Paginated<TaskListItem>>(tasksKeys.list(), (old) =>
        old
          ? {
              ...old,
              items: old.items.map((t) =>
                t.id === taskId
                  ? { ...t, personalStageId, updatedAt: new Date().toISOString() }
                  : t,
              ),
            }
          : old,
      );
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), (old) =>
        old ? { ...old, personalStageId, updatedAt: new Date().toISOString() } : old,
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
      void queryClient.invalidateQueries({ queryKey: tasksKeys.personalStages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(vars.taskId) });
    },
  });
}

/** Создание личной колонки (личная схема пользователя, ADR-0008). */
export function useCreatePersonalStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonalStageCreateBody) =>
      api<TaskStage>('/tasks/personal-stages', { method: 'POST', body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.personalStages() });
    },
  });
}

/** Переименование / цвет / состояние личной колонки. */
export function useUpdatePersonalStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, body }: { stageId: string; body: PersonalStageUpdateBody }) =>
      api<TaskStage>(`/tasks/personal-stages/${stageId}`, { method: 'PATCH', body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.personalStages() });
    },
  });
}

/** Удаление личной колонки: единственную нельзя (409 TASK_LAST_STAGE);
 *  задачи удаляемой переезжают в первую колонку того же состояния. */
export function useDeletePersonalStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      api<{ ok: boolean; movedToStageId: string }>(`/tasks/personal-stages/${stageId}`, {
        method: 'DELETE',
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.personalStages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.list() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
    },
  });
}
