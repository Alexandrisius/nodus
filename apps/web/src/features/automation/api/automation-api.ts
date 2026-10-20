import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTaskTypeBody,
  PublishWorkflowBody,
  PublishWorkflowResult,
  SaveWorkflowLayoutResult,
  TaskType,
  UpdateTaskTypeBody,
  WorkflowLayout,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { automationKeys } from '../../../shared/api/automation-keys.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';
import { workflowKeys } from '../../../shared/workflow/workflow-api.js';

export { automationKeys };

/** Библиотека типов задач: живые (по умолчанию), с архивом или только архив. */
export function useTaskTypes(archived?: 'include' | 'only') {
  return useQuery({
    queryKey: automationKeys.types(archived),
    queryFn: () => {
      const search = archived ? `?archived=${archived}` : '';
      return api<TaskType[]>(`/tasks/types${search}`);
    },
    staleTime: 60_000,
  });
}

/** Создание типа: тип + маршрут из основы (копия/простой), скрыт. */
export function useCreateTaskType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskTypeBody) =>
      api<TaskType>('/tasks/types', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.types() });
    },
    onError: () => toast.error(ui.common.saveError),
  });
}

/** Свойства типа сохраняются сразу (оптимистично, I4) и публикации не
 *  требуют — публикуется только маршрут. */
export function useUpdateTaskType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateTaskTypeBody }) =>
      api<TaskType>(`/tasks/types/${vars.id}`, { method: 'PATCH', body: vars.body }),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: automationKeys.all });
      const lists = queryClient.getQueriesData<TaskType[]>({ queryKey: automationKeys.all });
      const snapshots = lists.map(([key, data]) => ({
        key,
        data,
      }));
      for (const [key, data] of lists) {
        if (!data) continue;
        queryClient.setQueryData<TaskType[]>(
          key,
          data.map((t) =>
            t.id === id ? { ...t, ...body, description: body.description ?? t.description } : t,
          ),
        );
      }
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.key, snapshot.data);
      }
      toast.error(ui.common.saveError);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}

/** Архив/возврат типа (системный — 409 на сервере). */
export function useArchiveTaskType(archive: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<TaskType>(`/tasks/types/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
    onError: () => toast.error(ui.common.saveError),
  });
}

/** Публикация маршрута: версия + документ + обязательные переносы. */
export function usePublishWorkflow(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PublishWorkflowBody) =>
      api<PublishWorkflowResult>(`/tasks/workflows/${workflowId}/publish`, {
        method: 'POST',
        body,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
      toast.success(
        result.scheduledMoves > 0 ? ui.automation.movingTasksToast : ui.automation.publishedToast,
      );
    },
  });
}

/** Расстановка холста — сразу на сервер, без новой версии маршрута
 *  (`PUT /tasks/workflows/:id/layout`, #378 ред. 2). */
export function saveWorkflowLayout(
  workflowId: string,
  layout: WorkflowLayout,
): Promise<SaveWorkflowLayoutResult> {
  return api<SaveWorkflowLayoutResult>(`/tasks/workflows/${workflowId}/layout`, {
    method: 'PUT',
    body: { layout },
  });
}
