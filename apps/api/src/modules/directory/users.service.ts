import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CreateUserDto,
  type ListUsersQuery,
  type Paginated,
  type UpdateMyProfileDto,
  type UpdateUserDto,
  type UserCard,
  type UserListItem,
} from '@nodus/contracts';

import { PasswordService } from '../../core/crypto/password.service.js';
import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { EventBus } from '../../core/events/event-bus.js';
import { RolesRepository } from './roles.repository.js';
import { UsersRepository, type UserCardRow, type UserListRow } from './users.repository.js';

/** «Фамилия Имя Отчество» — денормализация для списков и JWT. */
export function buildDisplayName(parts: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [parts.lastName, parts.firstName, parts.middleName]
    .filter((p): p is string => Boolean(p))
    .join(' ');
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toUserCard(row: UserCardRow): UserCard {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    lastName: row.lastName,
    firstName: row.firstName,
    middleName: row.middleName,
    managerId: row.managerId,
    departmentId: row.departmentId,
    positionId: row.positionId,
    legalDepartmentId: row.legalDepartmentId,
    legalPositionId: row.legalPositionId,
    mobilePhone: row.mobilePhone,
    city: row.city,
    officeLocation: row.officeLocation,
    isRemote: row.isRemote,
    workRate: row.workRate,
    gender: row.gender,
    birthDate: toIsoDate(row.birthDate),
    hiredAt: toIsoDate(row.hiredAt),
    workdayStart: row.workdayStart,
    avatarUrl: row.avatarUrl,
    roles: row.roles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toListItem(row: UserListRow): UserListItem {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    avatarUrl: row.avatarUrl,
    email: row.email,
    positionName: row.position?.name ?? null,
    departmentName: row.department?.name ?? null,
  };
}

/**
 * Сценарии справочника сотрудников. Prisma — только репозиторий;
 * каждая мутация — tx + outbox-событие (I9), аудит — контроллером (@Audit).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly roles: RolesRepository,
    private readonly passwords: PasswordService,
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  async listUsers(query: ListUsersQuery): Promise<Paginated<UserListItem>> {
    const page = await this.users.findPage(
      { search: query.search, departmentId: query.departmentId, status: query.status },
      query.cursor,
      query.limit,
    );
    return { items: page.items.map(toListItem), nextCursor: page.nextCursor };
  }

  async getUserCard(id: string): Promise<UserCard> {
    const row = await this.users.findCardById(id);
    if (!row) {
      throw DomainException.notFound('User not found');
    }
    return toUserCard(row);
  }

  async createUser(dto: CreateUserDto, actorId: string): Promise<UserCard> {
    if (await this.users.emailExists(dto.email)) {
      throw new DomainException(ErrorCode.DIRECTORY_EMAIL_TAKEN, 'Email already registered');
    }
    await this.ensureRolesExist(dto.roleIds);
    const passwordHash = await this.passwords.hash(dto.password);

    return this.tx.run(async (tx) => {
      const created = await this.users.create(
        {
          email: dto.email,
          passwordHash,
          lastName: dto.lastName,
          firstName: dto.firstName,
          middleName: dto.middleName,
          displayName: buildDisplayName(dto),
          managerId: dto.managerId,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
          legalDepartmentId: dto.legalDepartmentId,
          legalPositionId: dto.legalPositionId,
        },
        tx,
      );
      if (dto.roleIds.length > 0) {
        await this.users.setRoles(created.id, dto.roleIds, tx);
      }
      await this.eventBus.emit(
        tx,
        'directory.user.created',
        { userId: created.id, email: created.email },
        { actorId, aggregateType: 'user', aggregateId: created.id },
      );
      return toUserCard((await this.users.findCardById(created.id, tx))!);
    });
  }

  async updateUser(id: string, dto: UpdateUserDto, actorId: string): Promise<UserCard> {
    const before = await this.users.findCardById(id);
    if (!before) {
      throw DomainException.notFound('User not found');
    }
    if (dto.roleIds) {
      await this.ensureRolesExist(dto.roleIds);
    }

    const names = {
      lastName: dto.lastName ?? before.lastName,
      firstName: dto.firstName ?? before.firstName,
      middleName: dto.middleName === undefined ? before.middleName : dto.middleName,
    };
    const { roleIds, ...fields } = dto;

    return this.tx.run(async (tx) => {
      await this.users.update(
        id,
        {
          ...fields,
          displayName: dto.displayName ?? buildDisplayName(names),
        },
        tx,
      );
      if (roleIds) {
        await this.users.setRoles(id, roleIds, tx);
      }
      await this.eventBus.emit(
        tx,
        'directory.user.updated',
        { userId: id, changedFields: Object.keys(dto) },
        { actorId, aggregateType: 'user', aggregateId: id },
      );
      return toUserCard((await this.users.findCardById(id, tx))!);
    });
  }

  /** Деактивация (увольнение): статус + событие; сессии отзовёт подписчик auth. */
  async deactivateUser(id: string, actorId: string): Promise<UserCard> {
    const before = await this.users.findCardById(id);
    if (!before) {
      throw DomainException.notFound('User not found');
    }
    if (before.status === 'deactivated') {
      return toUserCard(before); // идемпотентно
    }

    return this.tx.run(async (tx) => {
      await this.users.update(id, { status: 'deactivated' }, tx);
      await this.eventBus.emit(
        tx,
        'directory.user.deactivated',
        { userId: id },
        { actorId, aggregateType: 'user', aggregateId: id },
      );
      return toUserCard((await this.users.findCardById(id, tx))!);
    });
  }

  /** Саморедактирование: только контактный блок (updateMyProfileSchema). */
  async updateMyProfile(userId: string, dto: UpdateMyProfileDto): Promise<UserCard> {
    const before = await this.users.findCardById(userId);
    if (!before) {
      throw DomainException.notFound('User not found');
    }
    return this.tx.run(async (tx) => {
      await this.users.update(userId, { ...dto }, tx);
      await this.eventBus.emit(
        tx,
        'directory.user.updated',
        { userId, changedFields: Object.keys(dto) },
        { actorId: userId, aggregateType: 'user', aggregateId: userId },
      );
      return toUserCard((await this.users.findCardById(userId, tx))!);
    });
  }

  private async ensureRolesExist(roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const found = await this.roles.countByIds(roleIds);
    if (found !== roleIds.length) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Unknown role ids', { roleIds });
    }
  }
}
