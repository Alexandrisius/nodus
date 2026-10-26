import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission, Role } from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api, ApiError } from '../api-client.js';

/**
 * Роли портала и точечное переключение права (#379, ADR-0034).
 *
 * Живёт в shared: потребители — вкладка «Права доступа» любого модуля
 * (`shared/access`), а #432 переиспользует те же хуки. Features не
 * импортируются (направление слоёв: shared не знает о features).
 *
 * Точечные эндпоинты вместо PATCH всего набора: два администратора,
 * переключающие разные ячейки одной роли, не затирают друг друга.
 */

export const rolesKeys = {
  all: ['roles'] as const,
  list: () => [...rolesKeys.all, 'list'] as const,
};

/** Ключ мутаций переключения: `usePendingRolePermissions` и `isMutating`
 *  ищут запросы в полёте только по нему (у ролей бывают другие мутации). */
export const TOGGLE_ROLE_PERMISSION_KEY = ['roles', 'toggle-permission'] as const;

export interface ToggleRolePermissionVars {
  roleId: string;
  permission: Permission;
  granted: boolean;
}

/** Все роли портала в серверном порядке (системные первыми, далее по дате создания). */
export function useRoles() {
  return useQuery({
    queryKey: rolesKeys.list(),
    queryFn: () => api<Role[]>('/directory/roles'),
  });
}

/** Ключ ячейки матрицы «роль × право». */
export function rolePermissionKey(roleId: string, permission: string): string {
  return `${roleId}:${permission}`;
}

/** Копия роли с одним изменённым правом; порядок прав — как у сервера (по алфавиту). */
export function withPermission(role: Role, permission: Permission, granted: boolean): Role {
  const rest = role.permissions.filter((p) => p !== permission);
  const permissions = granted ? [...rest, permission].sort() : rest;
  return { ...role, permissions };
}

/**
 * Переключение права роли — оптимистично (I4) и только по своей ячейке
 * (канон TanStack/TkDodo «Concurrent Optimistic Updates»):
 * - `onMutate` — запоминает прежнее значение ячейки и применяет новое;
 * - `onError` — откатывает ТОЛЬКО эту ячейку (соседние мутации не трогает),
 *   404 — роль удалили: тост и перезапрос списка;
 * - `onSuccess` — подтверждает ячейку по DTO сервера (роль целиком не
 *   заменяет: у соседних ячеек могут быть свои запросы в полёте);
 * - `onSettled` — инвалидация, только когда это последняя мутация группы.
 * Ячейка с запросом в полёте недоступна — гонок на одной ячейке нет.
 */
export function useToggleRolePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: TOGGLE_ROLE_PERMISSION_KEY,
    mutationFn: ({ roleId, permission, granted }: ToggleRolePermissionVars) =>
      api<Role>(`/directory/roles/${roleId}/permissions/${encodeURIComponent(permission)}`, {
        method: granted ? 'PUT' : 'DELETE',
      }),

    onMutate: async ({ roleId, permission, granted }) => {
      await queryClient.cancelQueries({ queryKey: rolesKeys.list() });
      const roles = queryClient.getQueryData<Role[]>(rolesKeys.list()) ?? [];
      const wasGranted = roles.find((role) => role.id === roleId)?.permissions.includes(permission);
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (current) =>
        current?.map((role) =>
          role.id === roleId ? withPermission(role, permission, granted) : role,
        ),
      );
      return { wasGranted: wasGranted ?? false };
    },

    onError: (error, { roleId, permission, granted }, context) => {
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (current) =>
        current?.map((role) =>
          role.id === roleId
            ? withPermission(role, permission, context?.wasGranted ?? !granted)
            : role,
        ),
      );
      if (error instanceof ApiError && error.status === 404) {
        toast.error(ui.access.roleGone);
        void queryClient.invalidateQueries({ queryKey: rolesKeys.list() });
        return;
      }
      const code = error instanceof ApiError ? (error.code as ErrorCode) : undefined;
      toast.error((code && errorMessages[code]) || ui.common.saveError);
    },

    onSuccess: (role, { roleId, permission }) => {
      const granted = role.permissions.includes(permission);
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (current) =>
        current?.map((item) =>
          item.id === roleId ? withPermission(item, permission, granted) : item,
        ),
      );
    },

    onSettled: () => {
      // В onSettled текущая мутация ещё `pending` — 1 означает «последняя».
      if (queryClient.isMutating({ mutationKey: TOGGLE_ROLE_PERMISSION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: rolesKeys.list() });
      }
    },
  });
}

/** Ячейки с запросом в полёте (`roleId:permission`) — их флажки недоступны. */
export function usePendingRolePermissions(): ReadonlySet<string> {
  const pending = useMutationState({
    filters: { mutationKey: TOGGLE_ROLE_PERMISSION_KEY, status: 'pending' },
    select: (mutation) => mutation.state.variables as ToggleRolePermissionVars | undefined,
  });
  return new Set(
    pending
      .filter((vars): vars is ToggleRolePermissionVars => Boolean(vars))
      .map((vars) => rolePermissionKey(vars.roleId, vars.permission)),
  );
}
