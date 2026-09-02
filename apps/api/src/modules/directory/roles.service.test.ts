import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { RolesService } from './roles.service.js';

function roleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-1',
    code: 'admin',
    name: 'Администратор',
    description: null,
    isSystem: true,
    permissions: [{ permission: 'directory.read' }],
    ...overrides,
  };
}

describe('RolesService', () => {
  const roles = {
    findAll: vi.fn(),
    findById: vi.fn(),
    countByIds: vi.fn(),
    codeExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countAssignments: vi.fn(),
  };
  const tx = { run: vi.fn((cb: (t: string) => unknown) => cb('tx-handle')) };
  const eventBus = { emit: vi.fn() };

  let service: RolesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RolesService(roles as never, tx as never, eventBus as never);
  });

  describe('deleteRole', () => {
    it('системная роль → CONFLICT', async () => {
      roles.findById.mockResolvedValue(roleRow());

      await expect(service.deleteRole('role-1', 'admin-1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(roles.delete).not.toHaveBeenCalled();
    });

    it('назначенная роль → CONFLICT', async () => {
      roles.findById.mockResolvedValue(roleRow({ isSystem: false }));
      roles.countAssignments.mockResolvedValue(3);

      await expect(service.deleteRole('role-1', 'admin-1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(roles.delete).not.toHaveBeenCalled();
    });

    it('свободная несистемная → удаляет + событие в той же транзакции', async () => {
      roles.findById.mockResolvedValue(roleRow({ isSystem: false }));
      roles.countAssignments.mockResolvedValue(0);

      await service.deleteRole('role-1', 'admin-1');

      expect(roles.delete).toHaveBeenCalledWith('role-1', 'tx-handle');
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.role.deleted',
        expect.objectContaining({ roleId: 'role-1' }),
        expect.objectContaining({ actorId: 'admin-1' }),
      );
    });
  });

  describe('createRole', () => {
    it('занятый код → CONFLICT', async () => {
      roles.codeExists.mockResolvedValue(true);

      await expect(
        service.createRole(
          { code: 'admin', name: 'Дубль', description: null, permissions: [] },
          'admin-1',
        ),
      ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    });

    it('создание → роль + событие directory.role.created', async () => {
      roles.codeExists.mockResolvedValue(false);
      roles.create.mockResolvedValue(roleRow({ isSystem: false, code: 'editor' }));

      const role = await service.createRole(
        { code: 'editor', name: 'Редактор', description: null, permissions: ['directory.read'] },
        'admin-1',
      );

      expect(roles.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'editor' }),
        'tx-handle',
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.role.created',
        expect.objectContaining({ roleId: 'role-1', code: 'editor' }),
        expect.objectContaining({ actorId: 'admin-1' }),
      );
      expect(role.permissions).toEqual(['directory.read']);
    });
  });

  describe('updateRole', () => {
    it('замена прав — в транзакции (deleteMany+createMany+update атомарно)', async () => {
      roles.findById.mockResolvedValue(roleRow());
      roles.update.mockResolvedValue(roleRow());

      await service.updateRole('role-1', { permissions: ['directory.read'] }, 'admin-1');

      expect(tx.run).toHaveBeenCalledOnce();
      expect(roles.update).toHaveBeenCalledWith(
        'role-1',
        { permissions: ['directory.read'] },
        'tx-handle',
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.role.updated',
        expect.objectContaining({ roleId: 'role-1' }),
        expect.anything(),
      );
    });
  });
});
