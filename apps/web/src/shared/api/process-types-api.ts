import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDetail, TaskListItem, ProcessType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { automationKeys } from './automation-keys.js';
import { tasksKeys } from './tasks-keys.js';

/**
 * Типы процессов категории «задача» для потребителей вне фичи automation
 * (карточка задачи: смена типа, экспресс-форма: выбор типа) — кросс-фичевые
 * хуки в shared, канон task-stages.ts. Сами CRUD типов — features/automation.
 * Категория `task` — фильтр сервера и клиента: задачи не видят типы писем
 * (ADR-0024).
 */

/** Доступные при создании типы: живые creatable категории задачи. */
export function useCreatableProcessTypes() {
  return useQuery({
    queryKey: automationKeys.types('exclude', 'task'),
    queryFn: () => api<ProcessType[]>('/workflows/types?category=task'),
    staleTime: 60_000,
    select: (types: ProcessType[]) => types.filter((t) => t.creatable && t.category === 'task'),
  });
}

/** Тип по умолчанию (экспресс-форма, доска проекта): первый системный по
 *  порядку библиотеки («Стандартный»), иначе первый. Сервер без typeId
 *  берёт тот же «Стандартный», но форма шлёт выбранный тип явно. */
export function defaultProcessType(
  types: readonly ProcessType[] | undefined,
): ProcessType | undefined {
  return types?.find((t) => t.isSystem) ?? types?.[0];
}

/** Все живые типы (без фильтра creatable — для смены типа). */
export function useAliveProcessTypes() {
  return useQuery({
    queryKey: automationKeys.types('exclude', 'task'),
    queryFn: () => api<ProcessType[]>('/workflows/types?category=task'),
    staleTime: 60_000,
    select: (types: ProcessType[]) => types.filter((t) => !t.archivedAt && t.category === 'task'),
  });
}

/** Смена типа задачи (#378): если текущего статуса нет в новом маршруте —
 *  обязателен stageId. */
export function useChangeProcessType(taskId: string) {
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
