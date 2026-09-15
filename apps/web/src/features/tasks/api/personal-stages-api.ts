import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type {
  PersonalStageCreateBody,
  PersonalStageUpdateBody,
  TaskDetail,
  TaskListItem,
  TaskStage,
  Paginated,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { mapTaskInPages, tasksKeys } from './tasks-api.js';

// usePersonalStages/useCreateTask — canonical в shared/api/task-create
// (общая экспресс-форма shared/tasks); реэкспорт для потребителей фичи.
export { useCreateTask, usePersonalStages } from '../../../shared/api/task-create.js';

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
      await queryClient.cancelQueries({ queryKey: tasksKeys.listPages() });
      const previous = queryClient.getQueryData<InfiniteData<Paginated<TaskListItem>>>(
        tasksKeys.listPages(),
      );
      const previousDetail = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      queryClient.setQueryData<InfiniteData<Paginated<TaskListItem>>>(
        tasksKeys.listPages(),
        (old) =>
          mapTaskInPages(old, taskId, (t) => ({
            ...t,
            personalStageId,
            updatedAt: new Date().toISOString(),
          })),
      );
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), (old) =>
        old ? { ...old, personalStageId, updatedAt: new Date().toISOString() } : old,
      );
      return { previous, previousDetail };
    },

    onError: (_error, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.listPages(), context.previous);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(tasksKeys.detail(vars.taskId), context.previousDetail);
      }
      toast.error(ui.tasks.stageMoveError);
    },

    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.kanbanAll() });
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
      void queryClient.invalidateQueries({ queryKey: tasksKeys.kanbanAll() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
    },
  });
}
