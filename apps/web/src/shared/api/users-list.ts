import { useQuery } from '@tanstack/react-query';
import type { Paginated, UserListItem } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Справочник людей — ОДИН запрос на продукт, ключ shared (потребители:
 *  журнал сотрудников, фильтры и пикеры задач/проектов, палитра Ctrl+K).
 *  Ключ совпадает с directoryKeys.users() — общий кэш. */
export const usersListKey = ['directory', 'users'] as const;

export function useUsersList() {
  return useQuery({
    queryKey: usersListKey,
    queryFn: () => api<Paginated<UserListItem>>('/directory/users?limit=50'),
  });
}
