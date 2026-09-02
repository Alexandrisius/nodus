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
import { EventBus } from '../../core/events/event-bus.js';
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
    private readonly eventBus: EventBus,
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

  async create(dto: CreateDepartmentDto, actorId: string): Promise<DepartmentNode> {
    if (dto.parentId) {
      await this.ensureExists(dto.parentId);
    }
    return this.tx.run(async (tx) => {
      const created = await this.departments.create(dto, tx);
      await this.eventBus.emit(
        tx,
        'directory.department.created',
        { departmentId: created.id, kind: created.kind },
        { actorId, aggregateType: 'department', aggregateId: created.id },
      );
      return toNode(created, []);
    });
  }

  async update(id: string, dto: UpdateDepartmentDto, actorId: string): Promise<DepartmentNode> {
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
    return this.tx.run(async (tx) => {
      const updated = await this.departments.update(id, dto, tx);
      await this.eventBus.emit(
        tx,
        'directory.department.updated',
        { departmentId: id, changedFields: Object.keys(dto) },
        { actorId, aggregateType: 'department', aggregateId: id },
      );
      return toNode(updated, []);
    });
  }

  /** Архивация (не удаление — связи сотрудников и история сохраняются, I15). */
  async archive(id: string, actorId: string): Promise<void> {
    await this.ensureExists(id);
    await this.tx.run(async (tx) => {
      await this.departments.update(id, { isActive: false }, tx);
      await this.eventBus.emit(
        tx,
        'directory.department.archived',
        { departmentId: id },
        { actorId, aggregateType: 'department', aggregateId: id },
      );
    });
  }

  private async ensureExists(id: string): Promise<void> {
    if (!(await this.departments.findById(id))) {
      throw DomainException.notFound('Department not found');
    }
  }
}
