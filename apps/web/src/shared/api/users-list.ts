import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated, UserListItem } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Справочник людей — ОДИН запрос на продукт, ключ shared (потребители:
 *  журнал сотрудников, фильтры и пикеры задач/проектов, палитра Ctrl+K).
 *  Ключ совпадает с directoryKeys.users() — общий кэш. */
export const usersListKey = ['directory', 'users'] as const;

/** Поиск активных сотрудников для пикеров (серверный фильтр по ФИО/email —
 *  справочник на 170+ человек целиком на клиент не тянем); пустой запрос —
 *  первая страница справочника. */
export function useUsersSearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: [...usersListKey, 'search', q],
    queryFn: () =>
      api<Paginated<UserListItem>>(
        `/directory/users?status=active&limit=30${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useUsersList() {
  return useQuery({
    queryKey: usersListKey,
    queryFn: () => api<Paginated<UserListItem>>('/directory/users?limit=50'),
  });
}
