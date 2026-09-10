import { useQuery } from '@tanstack/react-query';
import type { Paginated, PresenceEntry, UserCard, UserListItem } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';

export const directoryKeys = {
  all: ['directory'] as const,
  users: () => [...directoryKeys.all, 'users'] as const,
  userCard: (id: string) => [...directoryKeys.all, 'user', id] as const,
  presence: () => [...directoryKeys.all, 'presence'] as const,
};

export function useUsersList() {
  return useQuery({
    queryKey: directoryKeys.users(),
    queryFn: () => api<Paginated<UserListItem>>('/directory/users?limit=50'),
  });
}

/** Полная карточка сотрудника (UserCard) — вкладка «Профиль». */
export function useUserCard(id: string) {
  return useQuery({
    queryKey: directoryKeys.userCard(id),
    queryFn: () => api<UserCard>(`/directory/users/${id}`),
  });
}

export function usePresence() {
  return useQuery({
    queryKey: directoryKeys.presence(),
    queryFn: () => api<PresenceEntry[]>('/directory/presence'),
  });
}
