import { Injectable } from '@nestjs/common';
import type { CreateRoleDto, Role, UpdateRoleDto } from '@nodus/contracts';

import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { EventBus } from '../../core/events/event-bus.js';
import { RolesRepository, type RoleRow } from './roles.repository.js';

function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissions: row.permissions.map((p) => p.permission) as Role['permissions'],
  };
}

/** Роли RBAC (бизнес-данные): CRUD + состав прав; системные не удаляются. */
@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  async listRoles(): Promise<Role[]> {
    return (await this.roles.findAll()).map(toRole);
  }

  async getRole(id: string): Promise<Role> {
    const row = await this.roles.findById(id);
    if (!row) {
      throw DomainException.notFound('Role not found');
    }
    return toRole(row);
  }

  async createRole(dto: CreateRoleDto, actorId: string): Promise<Role> {
    if (await this.roles.codeExists(dto.code)) {
      throw DomainException.conflict('Role code already exists', { code: dto.code });
    }
    return this.tx.run(async (tx) => {
      const created = await this.roles.create(dto, tx);
      await this.eventBus.emit(
        tx,
        'directory.role.created',
        { roleId: created.id, code: created.code },
        { actorId, aggregateType: 'role', aggregateId: created.id },
      );
      return toRole(created);
    });
  }

  async updateRole(id: string, dto: UpdateRoleDto, actorId: string): Promise<Role> {
    await this.getRole(id);
    // Замена прав (deleteMany+createMany) и update — в одной транзакции.
    return this.tx.run(async (tx) => {
      const updated = await this.roles.update(id, dto, tx);
      await this.eventBus.emit(
        tx,
        'directory.role.updated',
        { roleId: id, changedFields: Object.keys(dto) },
        { actorId, aggregateType: 'role', aggregateId: id },
      );
      return toRole(updated);
    });
  }

  /** Удаление: системные и назначенные роли не удаляются (защита данных). */
  async deleteRole(id: string, actorId: string): Promise<void> {
    const role = await this.getRole(id);
    if (role.isSystem) {
      throw DomainException.conflict('System role cannot be deleted', { code: role.code });
    }
    const assignments = await this.roles.countAssignments(id);
    if (assignments > 0) {
      throw DomainException.conflict('Role is assigned to users', { assignments });
    }
    await this.tx.run(async (tx) => {
      await this.roles.delete(id, tx);
      await this.eventBus.emit(
        tx,
        'directory.role.deleted',
        { roleId: id, code: role.code },
        { actorId, aggregateType: 'role', aggregateId: id },
      );
    });
  }
}
