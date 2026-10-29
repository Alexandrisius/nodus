import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, Permission, SystemRole } from '@nodus/contracts';

import { IdentityLoader } from '../../src/modules/auth/identity.loader.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture } from './chat-fixtures.js';

/**
 * Назначение ролей сотрудникам на живом стеке (#490, ADR-0034 «Дополнение»
 * п. 6): bind на явные `roleIds` (POST/PATCH /directory/users), bind на
 * неявные роли подразделения (перевод сотрудника и перенос подразделения),
 * последний администратор (PATCH и деактивация) — все пути смены ролей.
 * Актор путей — держатель `directory.manage`, но НЕ всех прав портала.
 */
describe('Назначение ролей сотрудникам (#490)', () => {
  let chat: Awaited<ReturnType<typeof setupChatFixture<'manager' | 'limited' | 'employee'>>>;
  let manager: { id: string; email: string; displayName: string; token: string };
  let limited: { id: string; email: string; displayName: string; token: string };
  let employee: { id: string; email: string; displayName: string; token: string };
  let adminRoleId: string;
  const roleIds: string[] = [];
  const createdUserIds: string[] = [];
  const departmentIds: string[] = [];

  const mint = async (user: { id: string; email: string; displayName: string }) => {
    const identity = await chat.app.get(IdentityLoader).load(user.id);
    expect(identity).not.toBeNull();
    const token = await chat.app.get(TokenService).signAccessToken(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        permissions: identity!.permissions,
      },
      'integration-test-session',
    );
    return { ...user, token };
  };

  let roleSeq = 0;
  const role = async (code: string, permissions: Permission[]) => {
    roleSeq += 1;
    const created = await chat.prisma.role.create({
      data: {
        code: `${code}-${roleSeq}-${chat.runId}`,
        name: `${code} ${chat.runId}`,
        isSystem: false,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      select: { id: true, code: true },
    });
    roleIds.push(created.id);
    return created;
  };

  beforeAll(async () => {
    chat = await setupChatFixture(['manager', 'limited', 'employee']);
    const prisma = chat.prisma;
    // Актор мутаций сотрудников: directory.manage, но без прав других разделов.
    const usersRole = await role('role-users-manager', [
      Permission.DIRECTORY_MANAGE,
      Permission.DIRECTORY_READ,
    ]);
    await prisma.userRole.create({
      data: { userId: chat.users.manager.id, roleId: usersRole.id },
    });
    // Роль «Администратор» прогона — два права, как в #379: bind на неё
    // требует TASK_CREATE, которого держатель directory.manage не имеет.
    const admin = await prisma.role.upsert({
      where: { code: SystemRole.ADMIN },
      update: { isSystem: true },
      create: { code: SystemRole.ADMIN, name: 'Администратор', isSystem: true },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: admin.id, permission: Permission.DIRECTORY_READ },
        { roleId: admin.id, permission: Permission.TASK_CREATE },
      ],
      skipDuplicates: true,
    });
    adminRoleId = admin.id;
    manager = await mint(chat.users.manager);
    limited = await mint(chat.users.limited);
    employee = await mint(chat.users.employee);
  });

  afterAll(async () => {
    try {
      const userIds = [...createdUserIds];
      await chat.prisma.event.deleteMany({
        where: { aggregateType: 'user', aggregateId: { in: userIds } },
      });
      await chat.prisma.auditLog.deleteMany({ where: { entityId: { in: userIds } } });
      await chat.prisma.user.deleteMany({ where: { id: { in: userIds } } });
      for (const id of [...departmentIds].reverse()) {
        await chat.prisma.department.delete({ where: { id } }).catch(() => undefined);
      }
      // Состав (user_roles/department_roles/permissions) уходит каскадом.
      await chat.prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    } finally {
      await chat.cleanup();
    }
  });

  const department = async (name: string, parentId?: string) => {
    const created = await chat.prisma.department.create({
      data: { name: `${name} ${chat.runId}`, kind: 'management', parentId },
      select: { id: true },
    });
    departmentIds.push(created.id);
    return created.id;
  };

  it('POST /directory/users: роль с чужим правом → 403 ROLE_PERMISSION_NOT_HELD', async () => {
    const { id: roleId } = await role('role-task', [Permission.TASK_CREATE]);

    const denied = await chat.api(manager, 'POST', '/directory/users', {
      key: randomUUID(),
      body: {
        email: `created-${chat.runId}@test.nodus.local`,
        password: 'Start!23456789',
        lastName: 'Создан',
        firstName: 'Интеграцией',
        roleIds: [roleId],
      },
    });

    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { code: string; details: { permissions: string[] } };
    expect(body.code).toBe(ErrorCode.ROLE_PERMISSION_NOT_HELD);
    expect(body.details.permissions).toEqual([Permission.TASK_CREATE]);
  });

  it('POST /directory/users: роль из прав актора → 201', async () => {
    const { id: roleId, code: roleCode } = await role('role-dir', [Permission.DIRECTORY_MANAGE]);

    const created = await chat.api(manager, 'POST', '/directory/users', {
      key: randomUUID(),
      body: {
        email: `created-${chat.runId}@test.nodus.local`,
        password: 'Start!23456789',
        lastName: 'Создан',
        firstName: 'Интеграцией',
        roleIds: [roleId],
      },
    });

    expect(created.status).toBe(201);
    const card = (await created.json()) as { id: string; roles: { code: string }[] };
    createdUserIds.push(card.id);
    expect(card.roles.map((role) => role.code)).toContain(roleCode);
  });

  it('PATCH /directory/users/:id: добавить роль с чужим правом → 403', async () => {
    const { id: roleId, code: roleCode } = await role('role-task', [Permission.TASK_CREATE]);

    const denied = await chat.api(manager, 'PATCH', `/directory/users/${employee.id}`, {
      key: randomUUID(),
      body: { roleIds: [roleId] },
    });

    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe(
      ErrorCode.ROLE_PERMISSION_NOT_HELD,
    );
    // Роли сотрудника не изменились.
    const card = (await (
      await chat.api(manager, 'GET', `/directory/users/${employee.id}`)
    ).json()) as { roles: { code: string }[] };
    expect(card.roles.map((role) => role.code)).not.toContain(roleCode);
  });

  it('PATCH /directory/users/:id: перевод в подразделение с привязанной ролью → 403', async () => {
    const { id: roleId } = await role('role-dept', [Permission.TASK_CREATE]);
    const dep = await department('Приём', undefined);
    await chat.prisma.departmentRole.create({ data: { roleId, departmentId: dep } });

    const denied = await chat.api(manager, 'PATCH', `/directory/users/${employee.id}`, {
      key: randomUUID(),
      body: { departmentId: dep },
    });

    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe(
      ErrorCode.ROLE_PERMISSION_NOT_HELD,
    );
  });

  it('PATCH /directory/departments/:id: перенос выдаёт роль поддереву → 403, parentId прежний', async () => {
    const { id: roleId } = await role('role-move', [Permission.TASK_CREATE]);
    const moved = await department('Переезжает', undefined);
    const target = await department('Новый родитель', undefined);
    await chat.prisma.departmentRole.create({ data: { roleId, departmentId: target } });
    await chat.prisma.user.update({
      where: { id: employee.id },
      data: { departmentId: moved },
    });

    const denied = await chat.api(manager, 'PATCH', `/directory/departments/${moved}`, {
      key: randomUUID(),
      body: { parentId: target },
    });

    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe(
      ErrorCode.ROLE_PERMISSION_NOT_HELD,
    );
    const row = await chat.prisma.department.findUnique({
      where: { id: moved },
      select: { parentId: true },
    });
    expect(row?.parentId).toBeNull();
  });

  it('PATCH /directory/departments/:id: kind не меняется — обход bind через «сон» привязки закрыт', async () => {
    const dep = await department('Переключаемое', undefined);

    const response = await chat.api(manager, 'PATCH', `/directory/departments/${dep}`, {
      key: randomUUID(),
      body: { kind: 'legal', name: 'Переключаемое-legal' },
    });

    expect(response.status).toBe(200);
    const row = await chat.prisma.department.findUnique({
      where: { id: dep },
      select: { kind: true, name: true },
    });
    expect(row?.kind).toBe('management');
    expect(row?.name).toBe('Переключаемое-legal');
  });

  it('последний администратор: roleIds без admin → 409, деактивация → 409', async () => {
    const saved = await chat.prisma.userRole.findMany({
      where: { roleId: adminRoleId },
      select: { userId: true },
    });
    try {
      await chat.prisma.userRole.deleteMany({ where: { roleId: adminRoleId } });
      await chat.prisma.userRole.createMany({
        data: [
          { roleId: adminRoleId, userId: limited.id },
          { roleId: adminRoleId, userId: employee.id },
        ],
      });

      const first = await chat.api(manager, 'PATCH', `/directory/users/${limited.id}`, {
        key: randomUUID(),
        body: { roleIds: [] },
      });
      expect(first.status).toBe(200);

      const lastByPatch = await chat.api(manager, 'PATCH', `/directory/users/${employee.id}`, {
        key: randomUUID(),
        body: { roleIds: [] },
      });
      expect(lastByPatch.status).toBe(409);
      expect(((await lastByPatch.json()) as { code: string }).code).toBe(ErrorCode.ROLE_LAST_ADMIN);

      const lastByDeactivate = await chat.api(
        manager,
        'POST',
        `/directory/users/${employee.id}/deactivate`,
        { key: randomUUID() },
      );
      expect(lastByDeactivate.status).toBe(409);
      expect(((await lastByDeactivate.json()) as { code: string }).code).toBe(
        ErrorCode.ROLE_LAST_ADMIN,
      );
      const status = await chat.prisma.user.findUnique({
        where: { id: employee.id },
        select: { status: true },
      });
      expect(status?.status).toBe('active');
    } finally {
      await chat.prisma.userRole.deleteMany({ where: { roleId: adminRoleId } });
      await chat.prisma.userRole.createMany({
        data: saved.map((row) => ({ roleId: adminRoleId, userId: row.userId })),
        skipDuplicates: true,
      });
    }
  });
});
