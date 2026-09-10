import { useQuery } from '@tanstack/react-query';
import type { Paginated, ProjectListItem, TaskListItem } from '@nodus/contracts';

import { api } from '../api-client.js';

/**
 * Связи карточки сотрудника (вкладки «Задачи»/«Проекты», I14 — анализ портала
 * от человека). Живут в shared/api: потребитель — features/directory, а I6
 * запрещает фичам импортировать друг друга (hooks задач/проектов — в своих
 * фичах); обе ветки — публичные list-ресурсы с query-фильтрами.
 */

export const userRelationsKeys = {
  tasks: (userId: string) => ['tasks', 'assignee', userId] as const,
  projects: (userId: string) => ['projects', 'member', userId] as const,
};

/** Задачи, где сотрудник — ответственный исполнитель (GET /tasks?assigneeId=). */
export function useAssigneeTasks(userId: string) {
  return useQuery({
    queryKey: userRelationsKeys.tasks(userId),
    queryFn: () => api<Paginated<TaskListItem>>(`/tasks?assigneeId=${userId}&limit=100`),
  });
}

/** Проекты сотрудника — руководит или участник (GET /projects?memberId=). */
export function useMemberProjects(userId: string) {
  return useQuery({
    queryKey: userRelationsKeys.projects(userId),
    queryFn: () => api<Paginated<ProjectListItem>>(`/projects?memberId=${userId}&limit=100`),
  });
}
