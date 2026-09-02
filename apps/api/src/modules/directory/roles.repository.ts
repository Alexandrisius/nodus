import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';

const roleInclude = {
  permissions: { select: { permission: true } },
} satisfies Prisma.RoleInclude;

export type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

/** Доступ к таблицам ролей (roles, role_permissions, user_roles). */
@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<RoleRow[]> {
    return this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(id: string): Promise<RoleRow | null> {
    return this.prisma.role.findUnique({ where: { id }, include: roleInclude });
  }

  async countByIds(ids: string[]): Promise<number> {
    return this.prisma.role.count({ where: { id: { in: ids } } });
  }

  async codeExists(code: string): Promise<boolean> {
    return (await this.prisma.role.count({ where: { code } })) > 0;
  }

  async create(
    data: { code: string; name: string; description: string | null; permissions: string[] },
    tx?: TransactionClient,
  ): Promise<RoleRow> {
    const client = tx ?? this.prisma;
    return client.role.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        permissions: { create: data.permissions.map((permission) => ({ permission })) },
      },
      include: roleInclude,
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string | null; permissions?: string[] },
    tx?: TransactionClient,
  ): Promise<RoleRow> {
    const client = tx ?? this.prisma;
    if (data.permissions) {
      await client.rolePermission.deleteMany({ where: { roleId: id } });
      if (data.permissions.length > 0) {
        await client.rolePermission.createMany({
          data: data.permissions.map((permission) => ({ roleId: id, permission })),
        });
      }
    }
    return client.role.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
      include: roleInclude,
    });
  }

  async delete(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.role.delete({ where: { id } });
  }

  /** Сколько сотрудников имеет роль (блокирует удаление назначенной). */
  async countAssignments(id: string): Promise<number> {
    return this.prisma.userRole.count({ where: { roleId: id } });
  }
}
