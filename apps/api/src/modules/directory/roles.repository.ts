import { Injectable } from '@nestjs/common';
import type { RoleDepartmentRef } from '@nodus/contracts';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';

/** Сколько аватаров показывать в шапке столбца роли (контракт `preview`). */
const PREVIEW_LIMIT = 4;

const roleInclude = {
  permissions: { select: { permission: true }, orderBy: { permission: 'asc' } },
  _count: {
    select: {
      // Только активные сотрудники и активные подразделения (ADR-0034).
      users: { where: { user: { status: 'active' } } },
      departments: { where: { department: { isActive: true } } },
    },
  },
} satisfies Prisma.RoleInclude;

export type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

/** Сотрудник в составе роли — до подписи аватара (подпись делает сервис). */
export interface RoleMemberRow {
  id: string;
  displayName: string;
  avatarFileId: string | null;
}

/** Строка роли + аватары состава: счётчики уже в `_count`. */
export interface RoleRecord {
  row: RoleRow;
  preview: RoleMemberRow[];
}

/**
 * Доступ к таблицам ролей (roles, role_permissions, user_roles,
 * department_roles) — единственная точка SQL по ним в модуле (patterns.md).
 * Порядок ролей и права внутри роли — Р8 плана #379 (системные первыми,
 * далее по дате создания; права по алфавиту).
 */
@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Список ролей со счётчиками и аватарами: два запроса, без N+1. */
  async findAll(): Promise<RoleRecord[]> {
    const rows = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const preview = await this.previewByRoleIds(rows.map((row) => row.id));
    return rows.map((row) => ({ row, preview: preview.get(row.id) ?? [] }));
  }

  async findById(id: string, tx?: TransactionClient): Promise<RoleRecord | null> {
    const row = await this.db(tx).role.findUnique({ where: { id }, include: roleInclude });
    if (!row) return null;
    const preview = await this.previewByRoleIds([id], tx);
    return { row, preview: preview.get(id) ?? [] };
  }

  /** Строка роли под `FOR UPDATE` — сериализует правки прав, состава и удаление. */
  async lockForUpdate(id: string, tx: TransactionClient): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE
    `);
    return rows.length === 1;
  }

  async countByIds(ids: string[], tx?: TransactionClient): Promise<number> {
    return this.db(tx).role.count({ where: { id: { in: ids } } });
  }

  /** Права ролей пачкой (bind #490): id роли → права по алфавиту. */
  async permissionsByIds(ids: string[], tx?: TransactionClient): Promise<Map<string, string[]>> {
    const byRole = new Map<string, string[]>();
    if (ids.length === 0) return byRole;
    const rows = await this.db(tx).role.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        permissions: { select: { permission: true }, orderBy: { permission: 'asc' } },
      },
    });
    for (const row of rows) {
      byRole.set(
        row.id,
        row.permissions.map((p) => p.permission),
      );
    }
    return byRole;
  }

  async codeExists(code: string): Promise<boolean> {
    return (await this.prisma.role.count({ where: { code } })) > 0;
  }

  async create(
    data: { code: string; name: string; description: string | null; permissions: string[] },
    tx?: TransactionClient,
  ): Promise<string> {
    const created = await this.db(tx).role.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        permissions: { create: data.permissions.map((permission) => ({ permission })) },
      },
      select: { id: true },
    });
    return created.id;
  }

  async update(
    id: string,
    data: { name?: string; description?: string | null; permissions?: string[] },
    tx?: TransactionClient,
  ): Promise<void> {
    const client = this.db(tx);
    if (data.permissions) {
      await client.rolePermission.deleteMany({ where: { roleId: id } });
      if (data.permissions.length > 0) {
        await client.rolePermission.createMany({
          data: data.permissions.map((permission) => ({ roleId: id, permission })),
        });
      }
    }
    await client.role.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  async delete(id: string, tx?: TransactionClient): Promise<void> {
    await this.db(tx).role.delete({ where: { id } });
  }

  /** Активные прямые участники: «последний администратор» считается по ним. */
  async countActiveDirectMembers(id: string, tx?: TransactionClient): Promise<number> {
    return this.db(tx).userRole.count({
      where: { roleId: id, user: { status: 'active' } },
    });
  }

  /** Состав роли: активные сотрудники по алфавиту и активные подразделения. */
  async findMembers(
    id: string,
  ): Promise<{ users: RoleMemberRow[]; departments: RoleDepartmentRef[] }> {
    const [users, departments] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { roleId: id, user: { status: 'active' } },
        select: { user: { select: { id: true, displayName: true, avatarFileId: true } } },
        orderBy: [{ user: { displayName: 'asc' } }, { userId: 'asc' }],
      }),
      this.prisma.departmentRole.findMany({
        where: { roleId: id, department: { isActive: true } },
        select: { department: { select: { id: true, name: true } } },
        orderBy: [{ department: { name: 'asc' } }, { departmentId: 'asc' }],
      }),
    ]);
    return {
      users: users.map((row) => row.user),
      departments: departments.map((row) => row.department),
    };
  }

  /** Добавить право: true — строки не было (реальное изменение). */
  async addPermission(roleId: string, permission: string, tx: TransactionClient): Promise<boolean> {
    const result = await tx.rolePermission.createMany({
      data: [{ roleId, permission }],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  /** Отозвать право: true — строка была (реальное изменение). */
  async removePermission(
    roleId: string,
    permission: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const result = await tx.rolePermission.deleteMany({ where: { roleId, permission } });
    return result.count === 1;
  }

  async addUser(roleId: string, userId: string, tx: TransactionClient): Promise<boolean> {
    const result = await tx.userRole.createMany({
      data: [{ roleId, userId }],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async removeUser(roleId: string, userId: string, tx: TransactionClient): Promise<boolean> {
    const result = await tx.userRole.deleteMany({ where: { roleId, userId } });
    return result.count === 1;
  }

  async addDepartment(
    roleId: string,
    departmentId: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const result = await tx.departmentRole.createMany({
      data: [{ roleId, departmentId }],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async removeDepartment(
    roleId: string,
    departmentId: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const result = await tx.departmentRole.deleteMany({ where: { roleId, departmentId } });
    return result.count === 1;
  }

  /** Активный сотрудник (для проверки цели назначения). */
  async findActiveUser(id: string, tx?: TransactionClient): Promise<boolean> {
    const user = await this.db(tx).user.findUnique({
      where: { id },
      select: { status: true },
    });
    return user?.status === 'active';
  }

  /** Активное управленческое подразделение: юридические и архивные — нельзя. */
  async findAssignableDepartment(id: string, tx?: TransactionClient): Promise<boolean> {
    const department = await this.db(tx).department.findUnique({
      where: { id },
      select: { isActive: true, kind: true },
    });
    return Boolean(department?.isActive) && department?.kind === 'management';
  }

  /** Аватары состава пачкой: один запрос на список ролей (§00.4). */
  private async previewByRoleIds(
    roleIds: readonly string[],
    tx?: TransactionClient,
  ): Promise<Map<string, RoleMemberRow[]>> {
    const byRole = new Map<string, RoleMemberRow[]>();
    if (roleIds.length === 0) return byRole;
    const rows = await this.db(tx).userRole.findMany({
      where: { roleId: { in: [...roleIds] }, user: { status: 'active' } },
      select: {
        roleId: true,
        user: { select: { id: true, displayName: true, avatarFileId: true } },
      },
      orderBy: [{ user: { displayName: 'asc' } }, { userId: 'asc' }],
    });
    for (const row of rows) {
      const list = byRole.get(row.roleId) ?? [];
      if (list.length < PREVIEW_LIMIT) {
        list.push(row.user);
        byRole.set(row.roleId, list);
      }
    }
    return byRole;
  }

  private db(tx?: TransactionClient) {
    return tx ?? this.prisma;
  }
}
