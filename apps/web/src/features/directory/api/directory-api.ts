import { useQuery } from '@tanstack/react-query';
import type { PresenceEntry, UserCard } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';

// Канонический хук справочника людей — shared (единый ключ/кэш); реэкспорт
// для обратной совместимости импортов фичи.
export { useUsersList } from '../../../shared/api/users-list.js';

export const directoryKeys = {
  all: ['directory'] as const,
  users: () => [...directoryKeys.all, 'users'] as const,
  userCard: (id: string) => [...directoryKeys.all, 'user', id] as const,
  presence: () => [...directoryKeys.all, 'presence'] as const,
};

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
