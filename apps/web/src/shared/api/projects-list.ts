import { useQuery } from '@tanstack/react-query';
import type { Paginated, ProjectListItem } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Справочник проектов — ОДИН запрос на продукт, ключ shared (потребители:
 *  журнал проектов, фильтры задач, палитра Ctrl+K). Ключ совпадает с
 *  projectsKeys.list() — общий кэш. `enabled: false` — блок связи не
 *  запрашивается, пока счётчик пуст (модуля проектов ещё нет, #52). */
export const projectsListKey = ['projects', 'list'] as const;

export function useProjectsList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: projectsListKey,
    queryFn: () => api<Paginated<ProjectListItem>>('/projects'),
    enabled: options.enabled ?? true,
  });
}
