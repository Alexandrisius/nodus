import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, Permission, roleSchema } from '@nodus/contracts';

import { setupRolesFixture } from './roles-fixtures.js';

/**
 * Состав роли на живом стеке (#379, ADR-0034): bind, последний администратор,
 * подразделения и наследование вниз по оргструктуре, события и аудит.
 * Сценарии 12–15, 17, 19–21 — §00.9-B плана.
 */
describe('Роли: состав (#379)', () => {
  let f: Awaited<ReturnType<typeof setupRolesFixture>>;
  let parent: string;
  let child: string;
  let neighbor: string;
  let legal: string;

  beforeAll(async () => {
    f = await setupRolesFixture();
    const department = (name: string, data: { parentId?: string; kind?: 'management' | 'legal' }) =>
      f.prisma.department
        .create({
          data: {
            name: `${name} ${f.runId}`,
            kind: data.kind ?? 'management',
            parentId: data.parentId,
          },
          select: { id: true },
        })
        .then((row) => row.id);
    parent = await department('IT-родитель', {});
    child = await department('IT-дочернее', { parentId: parent });
    neighbor = await department('IT-соседнее', {});
    legal = await department('IT-юридическое', { kind: 'legal' });
    await f.prisma.user.update({
      where: { id: f.users.limited.id },
      data: { departmentId: child },
    });
    await f.prisma.user.update({
      where: { id: f.users.employee.id },
      data: { departmentId: neighbor },
    });
  });

  afterAll(async () => {
    await f.prisma.department.deleteMany({
      where: { id: { in: [child, parent, neighbor, legal] } },
    });
    await f.cleanup();
  });

  const membersUrl = (roleId: string, kind: 'users' | 'departments', id: string) =>
    `/directory/roles/${roleId}/members/${kind}/${id}`;
  const permissionsOf = async (user: typeof f.users.manager) =>
    ((await (await f.api(user, 'GET', '/auth/me')).json()) as { permissions: string[] })
      .permissions;

  it('12. участник получает права роли, после удаления — теряет', async () => {
    const roleId = await f.createRole('Проба 12', [Permission.CUSTOM_FIELD_MANAGE]);

    const added = await f.api(
      f.users.manager,
      'PUT',
      membersUrl(roleId, 'users', f.users.limited.id),
      { key: randomUUID() },
    );
    expect(added.status).toBe(200);
    expect(roleSchema.parse(await added.json()).memberCount).toBe(1);
    expect(await permissionsOf(f.users.limited)).toContain(Permission.CUSTOM_FIELD_MANAGE);

    await f.api(f.users.manager, 'DELETE', membersUrl(roleId, 'users', f.users.limited.id), {
      key: randomUUID(),
    });
    expect(await permissionsOf(f.users.limited)).not.toContain(Permission.CUSTOM_FIELD_MANAGE);
  });

  it('13. bind: роль с чужим правом не назначить → 403', async () => {
    const roleId = await f.createRole('Проба 13', [Permission.WORKFLOW_MANAGE]);

    const denied = await f.api(
      f.users.limited,
      'PUT',
      membersUrl(roleId, 'users', f.users.employee.id),
      { key: randomUUID() },
    );

    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { code: string; details: { permissions: string[] } };
    expect(body.code).toBe(ErrorCode.ROLE_PERMISSION_NOT_HELD);
    expect(body.details.permissions).toEqual([Permission.WORKFLOW_MANAGE]);
  });

  it('14. последнего администратора убрать нельзя → 409, состав восстановлен', async () => {
    const saved = await f.prisma.userRole.findMany({
      where: { roleId: f.adminRoleId },
      select: { userId: true },
    });
    try {
      await f.prisma.userRole.deleteMany({ where: { roleId: f.adminRoleId } });
      await f.prisma.userRole.createMany({
        data: [
          { roleId: f.adminRoleId, userId: f.users.limited.id },
          { roleId: f.adminRoleId, userId: f.users.employee.id },
        ],
      });

      const first = await f.api(
        f.users.manager,
        'DELETE',
        membersUrl(f.adminRoleId, 'users', f.users.limited.id),
        { key: randomUUID() },
      );
      expect(first.status).toBe(200);

      const last = await f.api(
        f.users.manager,
        'DELETE',
        membersUrl(f.adminRoleId, 'users', f.users.employee.id),
        { key: randomUUID() },
      );
      expect(last.status).toBe(409);
      expect(((await last.json()) as { code: string }).code).toBe(ErrorCode.ROLE_LAST_ADMIN);
    } finally {
      await f.prisma.userRole.deleteMany({ where: { roleId: f.adminRoleId } });
      await f.prisma.userRole.createMany({
        data: saved.map((row) => ({ roleId: f.adminRoleId, userId: row.userId })),
        skipDuplicates: true,
      });
    }
  });

  it('15. подразделение: права доходят до вложенного, не доходят до соседнего и архивного', async () => {
    const roleId = await f.createRole('Проба 15', [Permission.CUSTOM_FIELD_MANAGE]);

    const bound = await f.api(f.users.manager, 'PUT', membersUrl(roleId, 'departments', parent), {
      key: randomUUID(),
    });
    expect(bound.status).toBe(200);
    expect(roleSchema.parse(await bound.json()).departmentCount).toBe(1);

    expect(await permissionsOf(f.users.limited)).toContain(Permission.CUSTOM_FIELD_MANAGE);
    expect(await permissionsOf(f.users.employee)).not.toContain(Permission.CUSTOM_FIELD_MANAGE);

    // Архивная привязка прав не даёт: подразделение выключили — роль не действует.
    await f.prisma.department.update({ where: { id: parent }, data: { isActive: false } });
    expect(await permissionsOf(f.users.limited)).not.toContain(Permission.CUSTOM_FIELD_MANAGE);
  });

  it('17. удаление роли с привязанным подразделением → 204, привязка снимается', async () => {
    const roleId = await f.createRole('Проба 17', []);
    await f.api(f.users.manager, 'PUT', membersUrl(roleId, 'departments', neighbor), {
      key: randomUUID(),
    });

    const response = await f.api(f.users.manager, 'DELETE', `/directory/roles/${roleId}`, {
      key: randomUUID(),
    });

    expect(response.status).toBe(204);
    expect((await f.api(f.users.manager, 'GET', `/directory/roles/${roleId}`)).status).toBe(404);
    expect(await f.prisma.departmentRole.count({ where: { roleId } })).toBe(0);
  });

  it('19. подразделение в роли «Администратор» → 409 ROLE_LOCKED (reason departments)', async () => {
    const response = await f.api(
      f.users.manager,
      'PUT',
      membersUrl(f.adminRoleId, 'departments', neighbor),
      { key: randomUUID() },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string; details: { reason: string } };
    expect(body.code).toBe(ErrorCode.ROLE_LOCKED);
    expect(body.details.reason).toBe('departments');
  });

  it('20. юридическое подразделение и несуществующий сотрудник → 400', async () => {
    const roleId = await f.createRole('Проба 20', []);

    const legalResponse = await f.api(
      f.users.manager,
      'PUT',
      membersUrl(roleId, 'departments', legal),
      { key: randomUUID() },
    );
    expect(legalResponse.status).toBe(400);

    const missing = await f.api(f.users.manager, 'PUT', membersUrl(roleId, 'users', randomUUID()), {
      key: randomUUID(),
    });
    expect(missing.status).toBe(400);
  });

  it('21. members_changed один раз, повтор без события, аудит на каждый вызов', async () => {
    const roleId = await f.createRole('Проба 21', []);
    const url = membersUrl(roleId, 'users', f.users.employee.id);

    await f.api(f.users.manager, 'PUT', url, { key: randomUUID() });
    await f.api(f.users.manager, 'PUT', url, { key: randomUUID() });

    const events = await f.eventsFor(roleId, 'directory.role.members_changed');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      roleId,
      kind: 'user',
      targetId: f.users.employee.id,
      added: true,
    });
    // Аудит пишет интерсептор после ответа (не в транзакции) — ждём строки.
    await expect
      .poll(async () => (await f.auditFor(roleId, 'directory.role.member_add')).length)
      .toBe(2);

    await f.api(f.users.manager, 'DELETE', url, { key: randomUUID() });
    await expect
      .poll(async () => (await f.auditFor(roleId, 'directory.role.member_remove')).length)
      .toBe(1);
  });
});
