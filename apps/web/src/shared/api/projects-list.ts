import { useQuery } from '@tanstack/react-query';
import type { Paginated, ProjectListItem } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Справочник проектов — ОДИН запрос на продукт, ключ shared (потребители:
 *  журнал проектов, фильтры задач, палитра Ctrl+K). Ключ совпадает с
 *  projectsKeys.list() — общий кэш. */
export const projectsListKey = ['projects', 'list'] as const;

export function useProjectsList() {
  return useQuery({
    queryKey: projectsListKey,
    queryFn: () => api<Paginated<ProjectListItem>>('/projects'),
  });
}
