import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskBody, TaskListItem, TaskStageWithCount, TaskType } from '@nodus/contracts';

import { api } from '../api-client.js';
import { tasksKeys } from './tasks-keys.js';

/** Личная схема «Мой план» (ADR-0008): колонки личной доски со счётчиками.
 *  В shared — потребители и фича задач, и общая экспресс-форма
 *  (`shared/tasks`, в т.ч. из карточки сотрудника). */
export function usePersonalStages() {
  return useQuery({
    queryKey: tasksKeys.personalStages(),
    queryFn: () => api<TaskStageWithCount[]>('/tasks/personal-stages'),
    // Справочник личной схемы: см. useTaskStages (staleTime, аудит #45).
    staleTime: 60_000,
  });
}

/** Создание задачи (канбан-плюсик колонки и экспресс-форма). Доски
 *  инвалидируются тоже: задача из экспресс-формы (топбар, мессенджер,
 *  карточка сотрудника) должна появиться на «Моём плане» без перезагрузки
 *  (вердикт владельца 16.10). Плюсик колонки вставляет карточку сразу сам. */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskBody) => api<TaskListItem>('/tasks', { method: 'POST', body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.personalStages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.kanbanAll() });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.stages() });
    },
  });
}

/** Каталог типов задач: ступень 1 — один системный «Задача» (ADR-0020);
 *  выбор типа уже в форме — задел под «Разработка/Изменение» ступени 2. */
export function useTaskTypes() {
  return useQuery({
    queryKey: tasksKeys.types(),
    queryFn: () => api<TaskType[]>('/tasks/types'),
    staleTime: 5 * 60_000,
  });
}
