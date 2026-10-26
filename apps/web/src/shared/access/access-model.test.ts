import { describe, expect, it } from 'vitest';
import type { Role } from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';

import { catalogRows, isLockedRole, orderColumns, roleCell } from './access-model.js';

/** Чистая модель матрицы прав (#379): порядок столбцов, причины
 *  недоступности ячейки, состав строк «Автоматизации». */

const role = (overrides: Partial<Role> = {}): Role => ({
  id: 'role-1',
  code: 'employee',
  name: 'Сотрудник',
  description: null,
  isSystem: true,
  permissions: [],
  ...overrides,
});

const admin = role({ id: 'role-admin', code: 'admin', name: 'Администратор' });

describe('access-model (#379)', () => {
  it('orderColumns: администратор первым, остальные — в порядке сервера', () => {
    const head = role({ id: 'role-head', code: 'head' });
    const custom = role({ id: 'role-custom', code: 'gip' });
    expect(orderColumns([head, custom, admin]).map((item) => item.code)).toEqual([
      'admin',
      'head',
      'gip',
    ]);
  });

  it('isLockedRole: только код администратора', () => {
    expect(isLockedRole(admin)).toBe(true);
    expect(isLockedRole(role({ code: 'head' }))).toBe(false);
  });

  it('catalogRows("automation"): три права в порядке матрицы', () => {
    expect(catalogRows('automation').map((row) => row.id)).toEqual([
      Permission.WORKFLOW_MANAGE,
      Permission.CUSTOM_FIELD_MANAGE,
      Permission.DICTIONARY_MANAGE,
    ]);
  });

  describe('roleCell: приоритет причин недоступности', () => {
    const base = {
      permission: Permission.WORKFLOW_MANAGE,
      canManage: true,
      actorPermissions: [Permission.WORKFLOW_MANAGE],
      pending: false,
    };

    it('свободная ячейка: отмечено по данным, доступно', () => {
      const cell = roleCell({ ...base, role: role({ permissions: [base.permission] }) });
      expect(cell).toEqual({ granted: true, disabled: false });
    });

    it('заблокированный столбец администратора — первым приоритетом', () => {
      const cell = roleCell({
        ...base,
        role: role({ code: 'admin' }),
        pending: true,
        canManage: false,
      });
      expect(cell).toEqual({ granted: false, disabled: true, hint: ui.access.lockedHint });
    });

    it('только просмотр — вторым приоритетом', () => {
      const cell = roleCell({
        ...base,
        role: role(),
        canManage: false,
        actorPermissions: [],
        pending: true,
      });
      expect(cell).toEqual({ granted: false, disabled: true, hint: ui.access.readOnlyHint });
    });

    it('чужое право — только для НЕотмеченной ячейки', () => {
      const foreign = roleCell({ ...base, role: role(), actorPermissions: [] });
      expect(foreign).toEqual({ granted: false, disabled: true, hint: ui.access.notHeldHint });

      // Отзыв чужого права разрешён: ячейка отмечена — доступна.
      const revoke = roleCell({
        ...base,
        role: role({ permissions: [base.permission] }),
        actorPermissions: [],
      });
      expect(revoke).toEqual({ granted: true, disabled: false });
    });

    it('запрос в полёте: недоступно и aria-busy, без подсказки', () => {
      const cell = roleCell({ ...base, role: role(), pending: true });
      expect(cell).toEqual({ granted: false, disabled: true, pending: true });
    });
  });
});
