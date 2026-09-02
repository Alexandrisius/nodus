import { useQuery } from '@tanstack/react-query';
import type { HomeSummary } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';

export const homeKeys = {
  all: ['home'] as const,
  summary: () => [...homeKeys.all, 'summary'] as const,
};

export function useHomeSummary() {
  return useQuery({
    queryKey: homeKeys.summary(),
    queryFn: () => api<HomeSummary>('/home/summary'),
  });
}
