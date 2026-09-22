import { useQuery } from '@tanstack/react-query';
import type { HomeSummary } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';
import { homeKeys } from '../../../shared/api/home-keys.js';

export { homeKeys };

export function useHomeSummary() {
  return useQuery({
    queryKey: homeKeys.summary(),
    queryFn: () => api<HomeSummary>('/home/summary'),
  });
}
