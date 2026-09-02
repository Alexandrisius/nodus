import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, type CreateUserDto } from '@nodus/contracts';

import { buildDisplayName, UsersService } from './users.service.js';

const CREATE_DTO: CreateUserDto = {
  email: 'new@nodus.by',
  password: 'Start!23456789',
  lastName: 'Новый',
  firstName: 'Сотрудник',
  middleName: null,
  managerId: null,
  departmentId: null,
  positionId: null,
  legalDepartmentId: null,
  legalPositionId: null,
  roleIds: ['role-1'],
};

function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'new@nodus.by',
    displayName: 'Новый Сотрудник',
    status: 'active',
    lastName: 'Новый',
    firstName: 'Сотрудник',
    middleName: null,
    managerId: null,
    departmentId: null,
    positionId: null,
    legalDepartmentId: null,
    legalPositionId: null,
    mobilePhone: null,
    city: null,
    officeLocation: null,
    isRemote: false,
    workRate: null,
    gender: null,
    birthDate: null,
    hiredAt: null,
    workdayStart: null,
    avatarUrl: null,
    roles: [],
    createdAt: new Date('2026-09-02T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    ...overrides,
  };
}

describe('buildDisplayName', () => {
  it('собирает ФИО с отчеством и без', () => {
    expect(
      buildDisplayName({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' }),
    ).toBe('Иванов Иван Иванович');
    expect(buildDisplayName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
});

describe('UsersService', () => {
  const users = {
    findPage: vi.fn(),
    findCardById: vi.fn(),
    emailExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setRoles: vi.fn(),
  };
  const roles = { countByIds: vi.fn() };
  const passwords = { hash: vi.fn() };
  const tx = { run: vi.fn((cb: (t: string) => unknown) => cb('tx-handle')) };
  const eventBus = { emit: vi.fn() };

  let service: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsersService(
      users as never,
      roles as never,
      passwords as never,
      tx as never,
      eventBus as never,
    );
  });

  describe('createUser', () => {
    it('создаёт с хэшем пароля и событием в той же транзакции', async () => {
      users.emailExists.mockResolvedValue(false);
      roles.countByIds.mockResolvedValue(1);
      passwords.hash.mockResolvedValue('argon2-hash');
      users.create.mockResolvedValue(cardRow());
      users.findCardById.mockResolvedValue(cardRow());

      const card = await service.createUser(CREATE_DTO, 'admin-1');

      expect(passwords.hash).toHaveBeenCalledWith('Start!23456789');
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@nodus.by',
          passwordHash: 'argon2-hash',
          displayName: 'Новый Сотрудник',
        }),
        'tx-handle',
      );
      expect(users.setRoles).toHaveBeenCalledWith('user-1', ['role-1'], 'tx-handle');
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.user.created',
        { userId: 'user-1', email: 'new@nodus.by' },
        expect.objectContaining({ actorId: 'admin-1' }),
      );
      expect(card.email).toBe('new@nodus.by');
    });

    it('занятый email → DIRECTORY_EMAIL_TAKEN, создания нет', async () => {
      users.emailExists.mockResolvedValue(true);

      await expect(service.createUser(CREATE_DTO, 'admin-1')).rejects.toMatchObject({
        code: ErrorCode.DIRECTORY_EMAIL_TAKEN,
      });
      expect(users.create).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('неизвестные роли → VALIDATION_FAILED', async () => {
      users.emailExists.mockResolvedValue(false);
      roles.countByIds.mockResolvedValue(0);

      await expect(service.createUser(CREATE_DTO, 'admin-1')).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
      });
    });
  });

  describe('deactivateUser', () => {
    it('деактивация → событие directory.user.deactivated', async () => {
      users.findCardById.mockResolvedValue(cardRow());

      await service.deactivateUser('user-1', 'admin-1');

      expect(users.update).toHaveBeenCalledWith('user-1', { status: 'deactivated' }, 'tx-handle');
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.user.deactivated',
        { userId: 'user-1' },
        expect.objectContaining({ actorId: 'admin-1' }),
      );
    });

    it('идемпотентна: уже деактивирован — без события', async () => {
      users.findCardById.mockResolvedValue(cardRow({ status: 'deactivated' }));

      await service.deactivateUser('user-1', 'admin-1');

      expect(users.update).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('не найден → NOT_FOUND', async () => {
      users.findCardById.mockResolvedValue(null);

      await expect(service.deactivateUser('nope', 'admin-1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe('updateMyProfile', () => {
    it('обновляет контактный блок и эмитит user.updated', async () => {
      users.findCardById.mockResolvedValue(cardRow());

      await service.updateMyProfile('user-1', { mobilePhone: '+375291234567', city: 'Минск' });

      expect(users.update).toHaveBeenCalledWith(
        'user-1',
        { mobilePhone: '+375291234567', city: 'Минск' },
        'tx-handle',
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.user.updated',
        expect.objectContaining({ userId: 'user-1' }),
        expect.anything(),
      );
    });
  });
});
