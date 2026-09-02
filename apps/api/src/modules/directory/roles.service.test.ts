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

  let service: RolesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RolesService(roles as never, tx as never);
  });

  describe('deleteRole', () => {
    it('системная роль → CONFLICT', async () => {
      roles.findById.mockResolvedValue(roleRow());

      await expect(service.deleteRole('role-1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(roles.delete).not.toHaveBeenCalled();
    });

    it('назначенная роль → CONFLICT', async () => {
      roles.findById.mockResolvedValue(roleRow({ isSystem: false }));
      roles.countAssignments.mockResolvedValue(3);

      await expect(service.deleteRole('role-1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(roles.delete).not.toHaveBeenCalled();
    });

    it('свободная несистемная → удаляет', async () => {
      roles.findById.mockResolvedValue(roleRow({ isSystem: false }));
      roles.countAssignments.mockResolvedValue(0);

      await service.deleteRole('role-1');

      expect(roles.delete).toHaveBeenCalledWith('role-1', 'tx-handle');
    });
  });

  describe('createRole', () => {
    it('занятый код → CONFLICT', async () => {
      roles.codeExists.mockResolvedValue(true);

      await expect(
        service.createRole({ code: 'admin', name: 'Дубль', description: null, permissions: [] }),
      ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    });
  });
});
