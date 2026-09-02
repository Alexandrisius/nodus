import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { DepartmentsService } from './departments.service.js';

function row(
  id: string,
  parentId: string | null,
  name = id,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name,
    kind: 'management',
    parentId,
    headId: null,
    deputyId: null,
    sortOrder: 0,
    isActive: true,
    head: null,
    deputy: null,
    _count: { members: 0 },
    ...overrides,
  };
}

describe('DepartmentsService', () => {
  const departments = {
    findAllByKind: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findParentChain: vi.fn(),
  };
  const tx = { run: vi.fn((cb: (t: string) => unknown) => cb('tx-handle')) };
  const eventBus = { emit: vi.fn() };

  let service: DepartmentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DepartmentsService(departments as never, tx as never, eventBus as never);
  });

  describe('getTree', () => {
    it('собирает иерархию из плоского списка с memberCount', async () => {
      departments.findAllByKind.mockResolvedValue([
        row('root', null, 'ПассатПроект', { _count: { members: 5 } }),
        row('child-1', 'root', 'Проектное'),
        row('child-2', 'root', 'Бухгалтерия'),
        row('grand', 'child-1', 'BIM-группа'),
      ]);

      const tree = await service.getTree('management');

      expect(tree).toHaveLength(1);
      expect(tree[0]!.name).toBe('ПассатПроект');
      expect(tree[0]!.memberCount).toBe(5);
      expect(tree[0]!.children.map((c) => c.name)).toEqual(['Проектное', 'Бухгалтерия']);
      expect(tree[0]!.children[0]!.children[0]!.name).toBe('BIM-группа');
    });
  });

  describe('update', () => {
    it('цикл в дереве (родитель — собственный потомок) → CONFLICT', async () => {
      departments.findById.mockResolvedValue(row('dep', null));
      departments.findParentChain.mockResolvedValue(['parent', 'dep']); // dep — предок parent

      await expect(service.update('dep', { parentId: 'parent' }, 'admin-1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(departments.update).not.toHaveBeenCalled();
    });

    it('валидная смена родителя → update + событие в транзакции', async () => {
      departments.findById.mockResolvedValue(row('dep', null));
      departments.findParentChain.mockResolvedValue(['new-parent']);
      departments.update.mockResolvedValue(row('dep', 'new-parent'));

      const node = await service.update('dep', { parentId: 'new-parent' }, 'admin-1');

      expect(departments.update).toHaveBeenCalledWith(
        'dep',
        { parentId: 'new-parent' },
        'tx-handle',
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.department.updated',
        expect.objectContaining({ departmentId: 'dep' }),
        expect.objectContaining({ actorId: 'admin-1' }),
      );
      expect(node.parentId).toBe('new-parent');
    });
  });

  describe('archive', () => {
    it('архивирует (isActive=false) + событие archived', async () => {
      departments.findById.mockResolvedValue(row('dep', null));

      await service.archive('dep', 'admin-1');

      expect(departments.update).toHaveBeenCalledWith('dep', { isActive: false }, 'tx-handle');
      expect(eventBus.emit).toHaveBeenCalledWith(
        'tx-handle',
        'directory.department.archived',
        { departmentId: 'dep' },
        expect.objectContaining({ actorId: 'admin-1' }),
      );
    });
  });
});
