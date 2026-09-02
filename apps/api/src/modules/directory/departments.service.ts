import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CreateDepartmentDto,
  type DepartmentNode,
  type OrgUnitKind,
  type UpdateDepartmentDto,
} from '@nodus/contracts';

import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { DepartmentsRepository, type DepartmentRow } from './departments.repository.js';

function toNode(row: DepartmentRow, children: DepartmentNode[]): DepartmentNode {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    headId: row.headId,
    deputyId: row.deputyId,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    headName: row.head?.displayName ?? null,
    deputyName: row.deputy?.displayName ?? null,
    memberCount: row._count.members,
    children,
  };
}

/**
 * Оргструктура: дерево подразделений (управленческое и юридическое).
 * Узел — руководитель (head) и постоянный заместитель (deputy) — эпик M2.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly departments: DepartmentsRepository,
    private readonly tx: TransactionRunner,
  ) {}

  /** Дерево: корни — parentId null; сортировка sortOrder+name на каждом уровне. */
  async getTree(kind: OrgUnitKind): Promise<DepartmentNode[]> {
    const rows = await this.departments.findAllByKind(kind);
    const byParent = new Map<string | null, DepartmentRow[]>();
    for (const row of rows) {
      const list = byParent.get(row.parentId) ?? [];
      list.push(row);
      byParent.set(row.parentId, list);
    }
    const build = (parentId: string | null): DepartmentNode[] =>
      (byParent.get(parentId) ?? []).map((row) => toNode(row, build(row.id)));
    return build(null);
  }

  async getById(id: string): Promise<DepartmentNode> {
    const row = await this.departments.findById(id);
    if (!row) {
      throw DomainException.notFound('Department not found');
    }
    return toNode(row, []);
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentNode> {
    if (dto.parentId) {
      await this.ensureExists(dto.parentId);
    }
    return this.tx.run(async (tx) => toNode(await this.departments.create(dto, tx), []));
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentNode> {
    await this.ensureExists(id);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.ensureExists(dto.parentId);
      // Защита от цикла: новый родитель не должен быть потомком узла.
      const chain = await this.departments.findParentChain(dto.parentId);
      if (chain.includes(id)) {
        throw new DomainException(ErrorCode.CONFLICT, 'Department tree cycle', {
          id,
          parentId: dto.parentId,
        });
      }
    }
    return this.tx.run(async (tx) => toNode(await this.departments.update(id, dto, tx), []));
  }

  /** Архивация (не удаление — связи сотрудников и история сохраняются, I15). */
  async archive(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.tx.run(async (tx) => {
      await this.departments.update(id, { isActive: false }, tx);
    });
  }

  private async ensureExists(id: string): Promise<void> {
    if (!(await this.departments.findById(id))) {
      throw DomainException.notFound('Department not found');
    }
  }
}
