import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role, RoleDepartmentRef, RoleMembers, UserRef } from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api, ApiError } from '../api-client.js';
import { rolesKeys } from './roles.js';

/**
 * Управление ролями и их составом (#379, ADR-0034): создать, скопировать,
 * переименовать, удалить, назначить сотрудников и подразделения. Все
 * мутации оптимистичны (I4) и откатывают только своё изменение.
 */

export const roleMembersKey = (roleId: string) => [...rolesKeys.all, 'members', roleId] as const;
const ROLE_MEMBER_MUTATION_KEY = ['roles', 'toggle-member'] as const;

/** id временной роли до ответа сервера: её столбец недоступен для правки. */
export const TEMP_ROLE_PREFIX = 'temp-';
export const isTempRole = (role: Pick<Role, 'id'>): boolean => role.id.startsWith(TEMP_ROLE_PREFIX);

function toastError(error: unknown, fallback: string = ui.common.saveError): void {
  const code = error instanceof ApiError ? (error.code as ErrorCode) : undefined;
  toast.error((code && errorMessages[code]) || fallback);
}

export interface CreateRoleVars {
  name: string;
  description?: string | null;
  permissions?: Role['permissions'];
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateRoleVars) =>
      api<Role>('/directory/roles', {
        method: 'POST',
        body: {
          name: vars.name.trim(),
          description: vars.description?.trim() || null,
          permissions: vars.permissions ?? [],
        },
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: rolesKeys.list() });
      const tempId = `${TEMP_ROLE_PREFIX}${crypto.randomUUID()}`;
      const temp: Role = {
        id: tempId,
        code: '',
        name: vars.name.trim(),
        description: vars.description?.trim() || null,
        isSystem: false,
        permissions: [...(vars.permissions ?? [])].sort(),
        memberCount: 0,
        departmentCount: 0,
        preview: [],
      };
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) => [...(roles ?? []), temp]);
      return { tempId };
    },
    onSuccess: (role, _vars, context) => {
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) =>
        roles?.map((item) => (item.id === context?.tempId ? role : item)),
      );
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) =>
        roles?.filter((item) => item.id !== context?.tempId),
      );
      toastError(error);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: rolesKeys.list() }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; description?: string | null };
    }) => api<Role>(`/directory/roles/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: rolesKeys.list() });
      const previous = queryClient.getQueryData<Role[]>(rolesKeys.list())?.find((r) => r.id === id);
      queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) =>
        roles?.map((role) => (role.id === id ? { ...role, ...body } : role)),
      );
      return { previous };
    },
    onError: (error, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) =>
          roles?.map((role) =>
            role.id === id
              ? {
                  ...role,
                  name: context.previous!.name,
                  description: context.previous!.description,
                }
              : role,
          ),
        );
      }
      toastError(error);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: rolesKeys.list() }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/directory/roles/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: rolesKeys.list() });
      const roles = queryClient.getQueryData<Role[]>(rolesKeys.list()) ?? [];
      const index = roles.findIndex((role) => role.id === id);
      const removed = roles[index];
      queryClient.setQueryData<Role[]>(
        rolesKeys.list(),
        roles.filter((role) => role.id !== id),
      );
      return { removed, index };
    },
    onError: (error, _id, context) => {
      const { removed, index } = context ?? {};
      if (removed) {
        queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) => {
          const next = [...(roles ?? [])];
          next.splice(Math.min(index ?? next.length, next.length), 0, removed);
          return next;
        });
      }
      toastError(error);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: rolesKeys.list() }),
  });
}

/** Состав роли (поповер «+» в шапке столбца). */
export function useRoleMembers(roleId: string, enabled: boolean) {
  return useQuery({
    queryKey: roleMembersKey(roleId),
    queryFn: () => api<RoleMembers>(`/directory/roles/${roleId}/members`),
    enabled,
  });
}

export type RoleMemberTarget =
  { kind: 'user'; ref: UserRef } | { kind: 'department'; ref: RoleDepartmentRef };

export interface ToggleRoleMemberVars {
  roleId: string;
  target: RoleMemberTarget;
  add: boolean;
}

/** Копия роли с учтённым изменением состава: счётчики и аватары шапки. */
export function withMember(role: Role, target: RoleMemberTarget, add: boolean): Role {
  const delta = add ? 1 : -1;
  if (target.kind === 'department') {
    return { ...role, departmentCount: Math.max(0, role.departmentCount + delta) };
  }
  const rest = role.preview.filter((user) => user.id !== target.ref.id);
  const preview = add ? [...rest, target.ref].slice(0, 4) : rest;
  return { ...role, memberCount: Math.max(0, role.memberCount + delta), preview };
}

function withMembers(members: RoleMembers, target: RoleMemberTarget, add: boolean): RoleMembers {
  if (target.kind === 'user') {
    const rest = members.users.filter((user) => user.id !== target.ref.id);
    return { ...members, users: add ? [...rest, target.ref] : rest };
  }
  const rest = members.departments.filter((dep) => dep.id !== target.ref.id);
  return { ...members, departments: add ? [...rest, target.ref] : rest };
}

export function useToggleRoleMember() {
  const queryClient = useQueryClient();
  const apply = (vars: ToggleRoleMemberVars, add: boolean) => {
    queryClient.setQueryData<Role[]>(rolesKeys.list(), (roles) =>
      roles?.map((role) => (role.id === vars.roleId ? withMember(role, vars.target, add) : role)),
    );
    queryClient.setQueryData<RoleMembers>(roleMembersKey(vars.roleId), (members) =>
      members ? withMembers(members, vars.target, add) : members,
    );
  };
  return useMutation({
    mutationKey: ROLE_MEMBER_MUTATION_KEY,
    mutationFn: ({ roleId, target, add }: ToggleRoleMemberVars) =>
      api<Role>(
        `/directory/roles/${roleId}/members/${target.kind === 'user' ? 'users' : 'departments'}/${target.ref.id}`,
        { method: add ? 'PUT' : 'DELETE' },
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: rolesKeys.list() });
      apply(vars, vars.add);
    },
    onError: (error, vars) => {
      apply(vars, !vars.add);
      toastError(error);
    },
    onSettled: (_data, _error, vars) => {
      if (queryClient.isMutating({ mutationKey: ROLE_MEMBER_MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: rolesKeys.list() });
        void queryClient.invalidateQueries({ queryKey: roleMembersKey(vars.roleId) });
      }
    },
  });
}
