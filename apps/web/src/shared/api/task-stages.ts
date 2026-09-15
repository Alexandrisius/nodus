import { useQuery } from '@tanstack/react-query';
import type { TaskStageWithCount } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Каталог стадий статус-схемы по умолчанию со счётчиками колонок
 *  (шапки канбанов, сводка страницы задач). Общий: потребители — задачи
 *  (страница, карточка) и проектная доска (колонки = стадии схемы проекта,
 *  ADR-0008). Ключ совпадает с tasksKeys.stages() — общий кэш. */
export const taskStagesKey = ['tasks', 'stages'] as const;

export function useTaskStages() {
  return useQuery({
    queryKey: taskStagesKey,
    queryFn: () => api<TaskStageWithCount[]>('/tasks/stages'),
    // Справочник: редко меняется в сессии — без staleTime каждый маунт доски
    // переспрашивал стадии (аудит #45: 301 запрос на 50 переключений вида).
    staleTime: 60_000,
  });
}
