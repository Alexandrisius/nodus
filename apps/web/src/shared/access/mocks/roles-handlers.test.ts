// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@nodus/contracts';
import { ErrorCode, Permission, roleSchema } from '@nodus/contracts';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import { userIds } from '../../mocks/data/users.js';
import { departmentIds } from '../../mocks/data/org-ids.js';

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

  const json = { 'content-type': 'application/json' };
  const roleOf = async (response: Response) => roleSchema.parse(await response.json());

  it('создание: роль появляется, права копируются, чужие — 403', async () => {
    actor([Permission.ROLE_MANAGE, Permission.TASK_CREATE]);
    const created = await fetch(BASE, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Проба', permissions: [Permission.TASK_CREATE] }),
    });
    expect(created.status).toBe(201);
    const role = await roleOf(created);
    expect(role.isSystem).toBe(false);
    expect(role.permissions).toEqual([Permission.TASK_CREATE]);
    expect((await listRoles()).some((item) => item.id === role.id)).toBe(true);

    const denied = await fetch(BASE, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Эскалация', permissions: [Permission.CORE_ADMIN] }),
    });
    expect(denied.status).toBe(403);
  });

  it('переименование администратора можно, права — нет', async () => {
    const renamed = await fetch(`${BASE}/${adminRole.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ name: 'Главный' }),
    });
    expect(renamed.status).toBe(200);
    const locked = await fetch(`${BASE}/${adminRole.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ permissions: [] }),
    });
    expect(locked.status).toBe(409);
  });

  it('состав: добавить сотрудника и подразделение, счётчики и аватары', async () => {
    actor(Object.values(Permission));
    const gip = demoRoles.find((role) => role.code === 'office')!;
    const before = (await listRoles()).find((role) => role.id === gip.id)!;
    const added = await fetch(`${BASE}/${gip.id}/members/users/${userIds.matorin}`, {
      method: 'PUT',
    });
    expect(added.status).toBe(200);
    const after = await roleOf(added);
    expect(after.memberCount).toBe(before.memberCount + 1);
    const members = z
      .object({ users: z.array(z.object({ id: z.string() })) })
      .parse(await (await fetch(`${BASE}/${gip.id}/members`)).json());
    expect(members.users.some((user) => user.id === userIds.matorin)).toBe(true);
    const removed = await fetch(`${BASE}/${gip.id}/members/users/${userIds.matorin}`, {
      method: 'DELETE',
    });
    expect((await roleOf(removed)).memberCount).toBe(before.memberCount);
  });

  it('удаление: системную и непустую нельзя, пустую можно', async () => {
    const system = await fetch(`${BASE}/${headRole.id}`, { method: 'DELETE' });
    expect(system.status).toBe(409);
    const withPeople = demoRoles.find((role) => role.code === 'gip')!;
    expect((await fetch(`${BASE}/${withPeople.id}`, { method: 'DELETE' })).status).toBe(409);
    const empty = demoRoles.find((role) => role.code === 'temporary')!;
    // «Временная роль» — демо-гонка: удаляется конкурентом (404), а не нами.
    const other = await roleOf(
      await fetch(BASE, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ name: 'Пустая' }),
      }),
    );
    expect((await fetch(`${BASE}/${other.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(empty.code).toBe('temporary');
  });

  it('назначение роли: только с правами, которые есть у актора; последнего администратора не убрать', async () => {
    actor([Permission.ROLE_MANAGE]);
    const office = demoRoles.find((role) => role.code === 'office')!;
    const denied = await fetch(`${BASE}/${office.id}/members/users/${userIds.matorin}`, {
      method: 'PUT',
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe(
      ErrorCode.ROLE_PERMISSION_NOT_HELD,
    );

    actor(Object.values(Permission));
    for (const id of [userIds.shaiderova, userIds.klimovich]) {
      const res = await fetch(`${BASE}/${adminRole.id}/members/users/${id}`, { method: 'DELETE' });
      if (id === userIds.klimovich) {
        expect(res.status).toBe(409);
        expect(((await res.json()) as { code: string }).code).toBe(ErrorCode.ROLE_LAST_ADMIN);
      } else {
        expect(res.status).toBe(200);
      }
    }
  });

  it('подразделение в роли администратора → 409 ROLE_LOCKED (reason departments), снятие — 200', async () => {
    actor(Object.values(Permission));
    const url = `${BASE}/${adminRole.id}/members/departments/${departmentIds.bim}`;
    const put = await fetch(url, { method: 'PUT' });
    expect(put.status).toBe(409);
    const body = (await put.json()) as { code: string; details: { reason: string } };
    expect(body.code).toBe(ErrorCode.ROLE_LOCKED);
    expect(body.details.reason).toBe('departments');

    // Снятие идемпотентно: подразделения в составе и не было.
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(200);
    const members = await (await fetch(`${BASE}/${adminRole.id}/members`)).json();
    expect((members as { departments: unknown[] }).departments).toHaveLength(0);
  });
});
