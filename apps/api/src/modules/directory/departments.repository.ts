import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';

const departmentInclude = {
  head: { select: { displayName: true } },
  deputy: { select: { displayName: true } },
  _count: { select: { members: { where: { status: 'active' as const } } } },
} satisfies Prisma.DepartmentInclude;

export type DepartmentRow = Prisma.DepartmentGetPayload<{ include: typeof departmentInclude }>;

/** Доступ к таблице departments (дерево оргструктуры, оба kind). */
@Injectable()
export class DepartmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Все подразделения вида (дерево собирает сервис); архивные — опционально. */
  async findAllByKind(
    kind: 'management' | 'legal',
    includeArchived = false,
  ): Promise<DepartmentRow[]> {
    return this.prisma.department.findMany({
      where: { kind, ...(includeArchived ? {} : { isActive: true }) },
      include: departmentInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(id: string, tx?: TransactionClient): Promise<DepartmentRow | null> {
    const client = tx ?? this.prisma;
    return client.department.findUnique({ where: { id }, include: departmentInclude });
  }

  async create(
    data: Prisma.DepartmentUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<DepartmentRow> {
    const client = tx ?? this.prisma;
    return client.department.create({ data, include: departmentInclude });
  }

  async update(
    id: string,
    data: Prisma.DepartmentUncheckedUpdateInput,
    tx?: TransactionClient,
  ): Promise<DepartmentRow> {
    const client = tx ?? this.prisma;
    return client.department.update({ where: { id }, data, include: departmentInclude });
  }

  /** Цепочка родителей (для проверки циклов при смене parentId). */
  async findParentChain(startId: string | null, maxDepth = 50): Promise<string[]> {
    const chain: string[] = [];
    let currentId = startId;
    for (let depth = 0; currentId && depth < maxDepth; depth += 1) {
      const row = await this.prisma.department.findUnique({
        where: { id: currentId },
        select: { id: true, parentId: true },
      });
      if (!row) break;
      chain.push(row.id);
      currentId = row.parentId;
    }
    return chain;
  }
}
