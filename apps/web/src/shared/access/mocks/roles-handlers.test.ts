// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@nodus/contracts';
import { ErrorCode, Permission, roleSchema } from '@nodus/contracts';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import { useAuthStore } from '../../auth-store.js';
import { DEMO_GONE_ROLE_ID, demoRoles } from '../../mocks/data/roles.js';
import { resetRoleMocks, rolesHandlers } from './roles-handlers.js';

/**
 * Мок-сервер «Прав доступа» (#379): правила совпадают с сервером — админ
 * неизменяем, чужое право не выдать, повтор идемпотентен, «Временная роль»
 * удаляется конкурентом (404), тело ответа проходит `roleSchema`.
 */

const server = setupServer(...rolesHandlers);
const BASE = '/api/v1/directory/roles';

const adminRole = demoRoles.find((role) => role.code === 'admin')!;
const headRole = demoRoles.find((role) => role.code === 'head')!;

function actor(permissions: Permission[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: '99999999-9999-4999-8999-999999999999',
      email: 'admin@nodus.by',
      displayName: 'Администратор Системный',
      permissions,
    },
  });
}

const permissionUrl = (roleId: string, permission: Permission) =>
  `${BASE}/${roleId}/permissions/${permission}`;

async function listRoles(): Promise<Role[]> {
  const response = await fetch(BASE);
  expect(response.status).toBe(200);
  return z.array(roleSchema).parse(await response.json());
}

describe('roles-handlers (#379)', () => {
  beforeEach(() => {
    resetRoleMocks();
    actor([Permission.ROLE_MANAGE, Permission.WORKFLOW_MANAGE]);
    server.listen({ onUnhandledRequest: 'error' });
    return () => server.close();
  });

  it('GET отдаёт роли по контракту, администратор первым', async () => {
    const roles = await listRoles();
    expect(roles).toHaveLength(demoRoles.length);
    expect(roles[0]?.code).toBe('admin');
    expect(roles[0]?.permissions).toHaveLength(Object.values(Permission).length);
  });

  it('PUT в столбец администратора → 409 ROLE_LOCKED', async () => {
    const response = await fetch(permissionUrl(adminRole.id, Permission.WORKFLOW_MANAGE), {
      method: 'PUT',
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string; details: { code: string } };
    expect(body.code).toBe(ErrorCode.ROLE_LOCKED);
    expect(body.details.code).toBe('admin');
  });

  it('PUT чужого права → 403 ROLE_PERMISSION_NOT_HELD, отзыв разрешён', async () => {
    actor([Permission.ROLE_MANAGE]);
    const denied = await fetch(permissionUrl(headRole.id, Permission.WORKFLOW_MANAGE), {
      method: 'PUT',
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe(
      ErrorCode.ROLE_PERMISSION_NOT_HELD,
    );

    const revoke = await fetch(permissionUrl(headRole.id, Permission.TASK_CREATE), {
      method: 'DELETE',
    });
    expect(revoke.status).toBe(200);
    expect(roleSchema.parse(await revoke.json()).permissions).not.toContain(Permission.TASK_CREATE);
  });

  it('без права управления ролями → 403 FORBIDDEN', async () => {
    actor([Permission.DIRECTORY_READ]);
    const response = await fetch(permissionUrl(headRole.id, Permission.TASK_CREATE), {
      method: 'DELETE',
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(ErrorCode.FORBIDDEN);
  });

  it('неизвестное право и не-uuid → 400', async () => {
    const badPermission = await fetch(`${BASE}/${headRole.id}/permissions/task.workflow_manage`, {
      method: 'PUT',
    });
    expect(badPermission.status).toBe(400);
    const badId = await fetch(`${BASE}/not-a-uuid/permissions/task.create`, { method: 'PUT' });
    expect(badId.status).toBe(400);
  });

  it('повторная выдача идемпотентна: тот же набор прав', async () => {
    const first = await fetch(permissionUrl(headRole.id, Permission.WORKFLOW_MANAGE), {
      method: 'PUT',
    });
    expect(first.status).toBe(200);
    const granted = roleSchema.parse(await first.json());
    expect(granted.permissions).toContain(Permission.WORKFLOW_MANAGE);

    const second = await fetch(permissionUrl(headRole.id, Permission.WORKFLOW_MANAGE), {
      method: 'PUT',
    });
    expect(second.status).toBe(200);
    const repeated = roleSchema.parse(await second.json());
    expect(repeated.permissions).toEqual(granted.permissions);
  });

  it('«Временная роль»: изменение → 404, роль исчезает из списка', async () => {
    // Право — из набора актора: иначе раньше сработает защита от эскалации (403).
    const response = await fetch(permissionUrl(DEMO_GONE_ROLE_ID, Permission.WORKFLOW_MANAGE), {
      method: 'PUT',
    });
    expect(response.status).toBe(404);
    const roles = await listRoles();
    expect(roles.some((role) => role.id === DEMO_GONE_ROLE_ID)).toBe(false);
  });
});
