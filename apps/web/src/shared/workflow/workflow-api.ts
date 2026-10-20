import { useQuery } from '@tanstack/react-query';
import type { WorkflowDetail } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Ключи маршрутов задач (#378): документ + версия + счётчики статусов.
 *  Живут в shared: потребитель «Схема маршрута» (shared/workflow) и фича
 *  «Автоматизация» — один кэш. */
export const workflowKeys = {
  all: ['tasks', 'workflows'] as const,
  detail: (id: string) => [...workflowKeys.all, 'detail', id] as const,
};

/** Загрузка одного маршрута (queryFn реестра и префетча меты списка типов). */
export function fetchWorkflowDetail(workflowId: string): Promise<WorkflowDetail> {
  return api<WorkflowDetail>(`/tasks/workflows/${workflowId}`);
}

/** Документ маршрута типа задачи (редактор и «Схема маршрута»). */
export function useWorkflowDetail(workflowId: string | null) {
  return useQuery({
    queryKey: workflowKeys.detail(workflowId ?? 'none'),
    queryFn: () => fetchWorkflowDetail(workflowId!),
    enabled: workflowId !== null,
    staleTime: 30_000,
  });
}
