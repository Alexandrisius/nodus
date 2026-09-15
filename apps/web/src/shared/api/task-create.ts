import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskBody, TaskListItem, TaskStageWithCount } from '@nodus/contracts';

import { api } from '../api-client.js';
import { tasksKeys } from './tasks-keys.js';

/** Личная схема «Мой план» (ADR-0008): колонки личной доски со счётчиками.
 *  В shared — потребители и фича задач, и общая экспресс-форма
 *  (`shared/tasks`, в т.ч. из карточки сотрудника). */
export function usePersonalStages() {
  return useQuery({
    queryKey: tasksKeys.personalStages(),
    queryFn: () => api<TaskStageWithCount[]>('/tasks/personal-stages'),
  });
}

/** Создание задачи (канбан-плюсик колонки и экспресс-форма). */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskBody) => api<TaskListItem>('/tasks', { method: 'POST', body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.personalStages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
    },
  });
}
