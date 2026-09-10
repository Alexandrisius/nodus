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
  });
}
