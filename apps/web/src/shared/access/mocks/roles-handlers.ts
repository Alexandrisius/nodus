import { delay, http, HttpResponse } from 'msw';
import type { Permission, Role, RoleMembers } from '@nodus/contracts';
import {
  ErrorCode,
  Permission as PermissionCatalog,
  SystemRole,
  createRoleSchema,
  permissionSchema,
  roleMembersSchema,
  roleSchema,
  updateRoleSchema,
} from '@nodus/contracts';
import { z } from 'zod';

import { demoDepartments } from '../../mocks/data/departments.js';
import { DEMO_GONE_ROLE_ID, demoRoleMembers, demoRoles } from '../../mocks/data/roles.js';
import { demoUserListItems } from '../../mocks/data/users.js';
import { getMockActor } from '../../mocks/mock-actor.js';

/**
 * Моки «Прав доступа» и состава ролей (#379, ADR-0034). Проверки идут в
 * порядке сервера: 400 (пайпы) → 403 (нет `role.manage`) → 404 → 409
 * (`admin` неизменяем) → 403 (чужое право) → «Временная роль» (её «удалил
 * другой администратор») → 200. Состав ролей (сотрудники и подразделения)
 * живёт в `members`; счётчики и аватары шапки считаются из него.
 * Состояние — на уровне модуля: перезагрузка страницы его сбрасывает
 * (gotcha msw-query). Тела ответов проверяются схемами contracts.
 */

interface Membership {
  userIds: string[];
  departmentIds: string[];
}

let state: Role[] = structuredClone(demoRoles);
let members: Record<string, Membership> = structuredClone(demoRoleMembers);

/** Сброс демо-ролей (тесты и повторный вход в демо-режим). */
export function resetRoleMocks(): void {
  state = structuredClone(demoRoles);
  members = structuredClone(demoRoleMembers);
}

const error = (code: string, message: string, status: number, details?: unknown) =>
  HttpResponse.json({ code, message, ...(details ? { details } : {}) }, { status });

const notFound = () => error(ErrorCode.NOT_FOUND, 'Role not found', 404);
const validation = () => error(ErrorCode.VALIDATION_FAILED, 'Invalid request', 400);

const userRef = (id: string) => {
  const user = demoUserListItems.find((item) => item.id === id);
  return user ? { id, displayName: user.displayName, avatarUrl: user.avatarUrl } : null;
};
const departmentRef = (id: string) => {
  const department = demoDepartments.find((item) => item.id === id);
  return department ? { id, name: department.name } : null;
};

/** Активные прямые участники роли: уволенные в счёт «последнего администратора» не идут. */
const activeUsers = (ids: readonly string[]): string[] =>
  ids.filter((id) => demoUserListItems.find((user) => user.id === id)?.status === 'active');

/** Роль с актуальным составом: счётчики и до 4 аватаров. */
function view(role: Role): Role {
  const membership = members[role.id] ?? { userIds: [], departmentIds: [] };
  const preview = membership.userIds
    .slice(0, 4)
    .map(userRef)
    .filter((ref): ref is NonNullable<typeof ref> => ref !== null);
  return roleSchema.parse({
    ...role,
    memberCount: membership.userIds.length,
    departmentCount: membership.departmentIds.length,
    preview,
  });
}

/** Копия роли с одним правом; порядок прав — как у сервера (по алфавиту). */
function withPermission(role: Role, permission: Permission, granted: boolean): Role {
  const rest = role.permissions.filter((item) => item !== permission);
  return { ...role, permissions: granted ? [...rest, permission].sort() : rest };
}

const can = (permission: Permission) => getMockActor().permissions.includes(permission);

/** Права, которых нет у актора (защита от эскалации, Р5). */
const notHeld = (permissions: readonly Permission[]) =>
  permissions.filter((permission) => !can(permission));

/** Типовой путь: id роли → роль (404 для «Временной роли» после её удаления). */
async function loadRole(id: unknown): Promise<Role | Response> {
  if (!z.uuid().safeParse(id).success) return validation();
  if (!can(PermissionCatalog.ROLE_MANAGE)) return error(ErrorCode.FORBIDDEN, 'Forbidden', 403);
  const role = state.find((item) => item.id === id);
  if (!role) return notFound();
  if (role.id === DEMO_GONE_ROLE_ID) {
    await delay(400);
    state = state.filter((item) => item.id !== DEMO_GONE_ROLE_ID);
    return notFound();
  }
  return role;
}

async function togglePermission(params: Record<string, unknown>, granted: boolean) {
  if (!permissionSchema.safeParse(params.permission).success) return validation();
  const permission = permissionSchema.parse(params.permission);
  if (z.uuid().safeParse(params.id).success) {
    const known = state.find((item) => item.id === params.id);
    if (known?.code === SystemRole.ADMIN && can(PermissionCatalog.ROLE_MANAGE)) {
      return error(ErrorCode.ROLE_LOCKED, 'Role permissions are locked', 409, {
        roleId: known.id,
        code: known.code,
      });
    }
  }
  const role = await loadRole(params.id);
  if (role instanceof Response) return role;
  if (granted && notHeld([permission]).length > 0) {
    return error(ErrorCode.ROLE_PERMISSION_NOT_HELD, 'Permission is not held by actor', 403, {
      permissions: [permission],
    });
  }
  const updated = withPermission(role, permission, granted);
  state = state.map((item) => (item.id === role.id ? updated : item));
  return HttpResponse.json(view(updated));
}

async function toggleMember(
  params: Record<string, unknown>,
  kind: 'users' | 'departments',
  add: boolean,
) {
  const role = await loadRole(params.id);
  if (role instanceof Response) return role;
  // Состав «Администратора» — только конкретные сотрудники (ADR-0034, п. 5).
  if (add && kind === 'departments' && role.code === SystemRole.ADMIN) {
    return error(ErrorCode.ROLE_LOCKED, 'Role departments are locked', 409, {
      roleId: role.id,
      code: role.code,
      reason: 'departments',
    });
  }
  const targetId = String(params[kind === 'users' ? 'userId' : 'departmentId']);
  const exists = kind === 'users' ? userRef(targetId) : departmentRef(targetId);
  if (!z.uuid().safeParse(targetId).success || !exists) return validation();
  const membership = members[role.id] ?? { userIds: [], departmentIds: [] };
  const key = kind === 'users' ? 'userIds' : 'departmentIds';
  // Назначить роль можно, только если у актора есть все её права (bind, ADR-0034).
  const missing = add ? notHeld(role.permissions) : [];
  if (missing.length > 0) {
    return error(ErrorCode.ROLE_PERMISSION_NOT_HELD, 'Permissions are not held by actor', 403, {
      permissions: missing,
    });
  }
  // Портал не остаётся без администратора: считаются активные прямые участники.
  if (!add && role.code === SystemRole.ADMIN && kind === 'users') {
    const remaining = membership.userIds.filter((id) => id !== targetId);
    if (activeUsers(remaining).length === 0) {
      return error(ErrorCode.ROLE_LAST_ADMIN, 'Last administrator', 409);
    }
  }
  const rest = membership[key].filter((id) => id !== targetId);
  members[role.id] = { ...membership, [key]: add ? [...rest, targetId] : rest };
  return HttpResponse.json(view(role));
}

export const rolesHandlers = [
  http.get('/api/v1/directory/roles', () => HttpResponse.json(state.map(view))),

  http.post('/api/v1/directory/roles', async ({ request }) => {
    if (!can(PermissionCatalog.ROLE_MANAGE)) return error(ErrorCode.FORBIDDEN, 'Forbidden', 403);
    const parsed = createRoleSchema.safeParse(await request.json());
    if (!parsed.success) return validation();
    const missing = notHeld(parsed.data.permissions);
    if (missing.length > 0) {
      return error(ErrorCode.ROLE_PERMISSION_NOT_HELD, 'Permissions are not held by actor', 403, {
        permissions: missing,
      });
    }
    const id = `f1000000-0000-4000-8000-${String(100 + state.length).padStart(12, '0')}`;
    const role: Role = {
      id,
      code: parsed.data.code ?? `role-${id.slice(-8)}`,
      name: parsed.data.name,
      description: parsed.data.description,
      isSystem: false,
      permissions: [...new Set(parsed.data.permissions)].sort(),
      memberCount: 0,
      departmentCount: 0,
      preview: [],
    };
    state = [...state, role];
    members[id] = { userIds: [], departmentIds: [] };
    return HttpResponse.json(view(role), { status: 201 });
  }),

  http.patch('/api/v1/directory/roles/:id', async ({ params, request }) => {
    const parsed = updateRoleSchema.safeParse(await request.json());
    if (!parsed.success) return validation();
    const role = await loadRole(params.id);
    if (role instanceof Response) return role;
    if (parsed.data.permissions) {
      if (role.code === SystemRole.ADMIN) {
        return error(ErrorCode.ROLE_LOCKED, 'Role permissions are locked', 409, {
          roleId: role.id,
          code: role.code,
        });
      }
      const added = parsed.data.permissions.filter((p) => !role.permissions.includes(p));
      if (notHeld(added).length > 0) {
        return error(ErrorCode.ROLE_PERMISSION_NOT_HELD, 'Not held by actor', 403, {
          permissions: notHeld(added),
        });
      }
    }
    const updated: Role = {
      ...role,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.permissions ? { permissions: [...parsed.data.permissions].sort() } : {}),
    };
    state = state.map((item) => (item.id === role.id ? updated : item));
    return HttpResponse.json(view(updated));
  }),

  http.delete('/api/v1/directory/roles/:id', async ({ params }) => {
    const role = await loadRole(params.id);
    if (role instanceof Response) return role;
    if (role.isSystem) {
      return error(ErrorCode.CONFLICT, 'System role cannot be deleted', 409, { code: role.code });
    }
    // Пользовательская роль удаляется вместе с составом: назначения снимаются
    // каскадом (ADR-0034), как и на сервере.
    state = state.filter((item) => item.id !== role.id);
    delete members[role.id];
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/v1/directory/roles/:id/members', ({ params }) => {
    const role = state.find((item) => item.id === params.id);
    if (!role) return notFound();
    const membership = members[role.id] ?? { userIds: [], departmentIds: [] };
    const body: RoleMembers = {
      users: membership.userIds.map(userRef).filter((ref) => ref !== null),
      departments: membership.departmentIds.map(departmentRef).filter((ref) => ref !== null),
    };
    return HttpResponse.json(roleMembersSchema.parse(body));
  }),

  http.put('/api/v1/directory/roles/:id/members/users/:userId', ({ params }) =>
    toggleMember(params, 'users', true),
  ),
  http.delete('/api/v1/directory/roles/:id/members/users/:userId', ({ params }) =>
    toggleMember(params, 'users', false),
  ),
  http.put('/api/v1/directory/roles/:id/members/departments/:departmentId', ({ params }) =>
    toggleMember(params, 'departments', true),
  ),
  http.delete('/api/v1/directory/roles/:id/members/departments/:departmentId', ({ params }) =>
    toggleMember(params, 'departments', false),
  ),

  http.put('/api/v1/directory/roles/:id/permissions/:permission', ({ params }) =>
    togglePermission(params, true),
  ),
  http.delete('/api/v1/directory/roles/:id/permissions/:permission', ({ params }) =>
    togglePermission(params, false),
  ),
];
