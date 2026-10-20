import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDetail, TaskListItem, TaskType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { automationKeys } from './automation-keys.js';
import { tasksKeys } from './tasks-keys.js';

/**
 * Типы задач для потребителей вне фичи automation (карточка задачи:
 * смена типа, экспресс-форма: выбор типа) — кросс-фичевые хуки в shared,
 * канон task-stages.ts. Сами CRUD типов — features/automation.
 */

/** Доступные при создании типы: живые creatable. */
export function useCreatableTaskTypes() {
  return useQuery({
    queryKey: automationKeys.types(),
    queryFn: () => api<TaskType[]>('/tasks/types'),
    staleTime: 60_000,
    select: (types: TaskType[]) => types.filter((t) => t.creatable),
  });
}

/** Все живые типы (без фильтра creatable — для смены типа). */
export function useAliveTaskTypes() {
  return useQuery({
    queryKey: automationKeys.types(),
    queryFn: () => api<TaskType[]>('/tasks/types'),
    staleTime: 60_000,
    select: (types: TaskType[]) => types.filter((t) => !t.archivedAt),
  });
}

/** Смена типа задачи (#378): если текущего статуса нет в новом маршруте —
 *  обязателен stageId. */
export function useChangeTaskType(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { typeId: string; stageId?: string }) =>
      api<TaskListItem>(`/tasks/${taskId}/type`, { method: 'POST', body }),
    onSuccess: (item) => {
      // Ответ — строка задачи (контракт), не деталь: мержим поля строки,
      // деталь (маршрут задачи сменился) — перезапрос.
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), (prev) =>
        prev ? { ...prev, ...item } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.transitions(taskId) });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.kanbanAll() });
    },
    onError: () => toast.error(ui.common.saveError),
  });
}
