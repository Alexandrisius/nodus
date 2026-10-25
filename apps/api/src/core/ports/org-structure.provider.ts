import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TransactionClient } from '../database/transaction-runner.js';
import type { DepartmentRef, OrgStructureReader } from './org-structure.port.js';

/**
 * Реализация OrgStructureReader (ADR-0012): рекурсивные CTE по users
 * (manager_id) и departments (parent_id, head/deputy). Объём — штат
 * компании (~170), один запрос на чтение списка задач.
 */
@Injectable()
export class OrgStructureProvider implements OrgStructureReader {
  constructor(private readonly prisma: PrismaService) {}

  async subordinateIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE
        led AS (
          SELECT id FROM departments
          WHERE is_active AND (head_id = ${userId}::uuid OR deputy_id = ${userId}::uuid)
          UNION
          SELECT d.id FROM departments d JOIN led ON d.parent_id = led.id WHERE d.is_active
        ),
        chain AS (
          SELECT id FROM users WHERE manager_id = ${userId}::uuid
          UNION
          SELECT u.id FROM users u JOIN chain ON u.manager_id = chain.id
        )
      SELECT id FROM chain
      UNION
      SELECT u.id FROM users u WHERE u.department_id IN (SELECT id FROM led)
    `);
    return rows.map((r) => r.id).filter((id) => id !== userId);
  }

  /** Управленческое подразделение сотрудника: юридические (`kind='legal'`)
   *  не участвуют — сводки и умолчания считаются по оргструктуре. */
  async departmentOf(userId: string, tx?: TransactionClient): Promise<string | null> {
    const row = await this.db(tx).user.findUnique({
      where: { id: userId },
      select: { department: { select: { id: true, kind: true, isActive: true } } },
    });
    const department = row?.department;
    if (!department || !department.isActive || department.kind !== 'management') return null;
    return department.id;
  }

  async departmentRefs(ids: readonly string[], tx?: TransactionClient): Promise<DepartmentRef[]> {
    if (ids.length === 0) return [];
    return this.db(tx).department.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, isActive: true },
    });
  }

  private db(tx?: TransactionClient) {
    return tx ?? this.prisma;
  }
}
