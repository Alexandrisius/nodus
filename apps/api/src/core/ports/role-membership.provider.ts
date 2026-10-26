import { Injectable } from '@nestjs/common';
import { Permission } from '@nodus/contracts';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TransactionClient } from '../database/transaction-runner.js';
import type { RoleMembershipReader } from './role-membership.port.js';

/** Предохранитель рекурсии: глубина дерева подразделений на порядок меньше. */
const MAX_DEPTH = 32;

/**
 * Реализация RoleMembershipReader (ADR-0034, п. 4): один запрос с рекурсивным
 * CTE — подъём по управленческим предкам сотрудника и объединение прямых
 * ролей с ролями привязанных подразделений. N+1 нет: роль, привязанная к
 * корню, действует на всех, а перевод сотрудника между подразделениями
 * меняет набор прав без пересборки связей.
 */
@Injectable()
export class RoleMembershipProvider implements RoleMembershipReader {
  constructor(private readonly prisma: PrismaService) {}

  async effectiveRoleIds(userId: string, tx?: TransactionClient): Promise<string[]> {
    const rows = await this.db(tx).$queryRaw<{ role_id: string }[]>(this.roleIdsQuery(userId));
    return rows.map((row) => row.role_id);
  }

  async effectiveRoles(
    userId: string,
    tx?: TransactionClient,
  ): Promise<{ id: string; code: string }[]> {
    return this.db(tx).$queryRaw<{ id: string; code: string }[]>(
      Prisma.sql`
        WITH ${this.roleIdsCte(userId)}
        SELECT r.id AS id, r.code AS code
        FROM role_ids ri JOIN roles r ON r.id = ri.role_id
        ORDER BY r.code
      `,
    );
  }

  async effectivePermissions(userId: string, tx?: TransactionClient): Promise<Permission[]> {
    const rows = await this.db(tx).$queryRaw<{ permission: string }[]>(
      Prisma.sql`
        WITH ${this.roleIdsCte(userId)}
        SELECT DISTINCT rp.permission AS permission
        FROM role_permissions rp JOIN role_ids r ON r.role_id = rp.role_id
        ORDER BY permission
      `,
    );
    const known = new Set<string>(Object.values(Permission));
    return rows
      .map((row) => row.permission)
      .filter((permission): permission is Permission => known.has(permission));
  }

  private roleIdsQuery(userId: string): Prisma.Sql {
    return Prisma.sql`
      WITH ${this.roleIdsCte(userId)}
      SELECT role_id FROM role_ids
    `;
  }

  /** `chain` — управленческое подразделение сотрудника и все предки;
   *  `role_ids` — прямые роли ∪ роли активных управленческих привязок. */
  private roleIdsCte(userId: string): Prisma.Sql {
    return Prisma.sql`
      RECURSIVE chain(id, parent_id, depth) AS (
        SELECT d.id, d.parent_id, 0
        FROM departments d JOIN users u ON u.department_id = d.id
        WHERE u.id = ${userId}::uuid
        UNION ALL
        SELECT p.id, p.parent_id, c.depth + 1
        FROM departments p JOIN chain c ON p.id = c.parent_id
        WHERE c.depth < ${MAX_DEPTH}
      ), role_ids AS (
        SELECT role_id FROM user_roles WHERE user_id = ${userId}::uuid
        UNION
        SELECT dr.role_id
        FROM department_roles dr
        JOIN chain c ON c.id = dr.department_id
        JOIN departments d ON d.id = dr.department_id AND d.is_active AND d.kind = 'management'
      )
    `;
  }

  private db(tx?: TransactionClient) {
    return tx ?? this.prisma;
  }
}
