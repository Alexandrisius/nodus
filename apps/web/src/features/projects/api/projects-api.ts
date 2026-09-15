import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Paginated, ProjectListItem, TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';

// Канонический хук справочника проектов — shared (единый ключ/кэш);
// реэкспорт для обратной совместимости импортов фичи.
export { useProjectsList } from '../../../shared/api/projects-list.js';

export const projectsKeys = {
  all: ['projects'] as const,
  list: () => [...projectsKeys.all, 'list'] as const,
  detail: (id: string) => [...projectsKeys.all, 'detail', id] as const,
};

export function useProjectDetail(id: string) {
  return useQuery({
    queryKey: projectsKeys.detail(id),
    queryFn: () => api<ProjectListItem>(`/projects/${id}`),
    // Смена проекта в стеке слайдеров: прежний контент остаётся, пока
    // грузится новый — панель не мигает скелетоном (I4).
    placeholderData: keepPreviousData,
  });
}

/** Задачи проекта (вид «Список»): те же сущности, фильтр projectId
 *  (плейбук §3.1 — один канбан и один список задач, а не два). */
export function useProjectTaskPages(projectId: string) {
  return useInfiniteQuery({
    queryKey: tasksKeys.listPages({ projectId }),
    queryFn: ({ pageParam }) =>
      api<Paginated<TaskListItem>>(
        `/tasks?projectId=${projectId}&limit=100${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: projectId.length > 0,
  });
}

/** Перенос задачи проектной доски по глобальной оси (ADR-0008): борд —
 *  локальное состояние колонки (оптимистично, I4), сервер — PATCH /tasks/:id;
 *  откат снапшотом и тост — в обработчиках компонента доски. */
export function useMoveProjectTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, stageId, index }: { taskId: string; stageId: string; index: number }) =>
      api<TaskListItem>(`/tasks/${taskId}`, { method: 'PATCH', body: { stageId, index } }),
    onError: () => {
      toast.error(ui.tasks.stageMoveError);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

/** Быстрое создание задачи в колонку проектной доски (плюсик в шапке):
 *  POST /tasks c stageId (глобальная ось) + projectId. */
export function useCreateProjectTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, stageId }: { title: string; stageId: string }) =>
      api<TaskListItem>('/tasks', { method: 'POST', body: { title, stageId, projectId } }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}
