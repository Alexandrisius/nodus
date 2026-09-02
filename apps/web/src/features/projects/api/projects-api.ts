import { useQuery } from '@tanstack/react-query';
import type { Paginated, ProjectListItem } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';

export const projectsKeys = {
  all: ['projects'] as const,
  list: () => [...projectsKeys.all, 'list'] as const,
  detail: (id: string) => [...projectsKeys.all, 'detail', id] as const,
};

export function useProjectsList() {
  return useQuery({
    queryKey: projectsKeys.list(),
    queryFn: () => api<Paginated<ProjectListItem>>('/projects'),
  });
}

export function useProjectDetail(id: string) {
  return useQuery({
    queryKey: projectsKeys.detail(id),
    queryFn: () => api<ProjectListItem>(`/projects/${id}`),
  });
}
