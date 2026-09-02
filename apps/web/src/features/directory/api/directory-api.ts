import { useQuery } from '@tanstack/react-query';
import type { Paginated, PresenceEntry, UserListItem } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';

export const directoryKeys = {
  all: ['directory'] as const,
  users: () => [...directoryKeys.all, 'users'] as const,
  presence: () => [...directoryKeys.all, 'presence'] as const,
};

export function useUsersList() {
  return useQuery({
    queryKey: directoryKeys.users(),
    queryFn: () => api<Paginated<UserListItem>>('/directory/users?limit=50'),
  });
}

export function usePresence() {
  return useQuery({
    queryKey: directoryKeys.presence(),
    queryFn: () => api<PresenceEntry[]>('/directory/presence'),
  });
}
