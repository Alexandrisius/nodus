import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import {
  catalogPermissions,
  isLockedRole,
  notHeld,
  permissionsDiff,
  uniquePermissions,
} from './role-permission-rules.js';

/** Правила прав ролей (#379, ADR-0034): чистые функции, без I/O. */
describe('role-permission-rules', () => {
  it('заблокирована только роль «Администратор»', () => {
    expect(isLockedRole({ code: 'admin' })).toBe(true);
    expect(isLockedRole({ code: 'head' })).toBe(false);
  });

  it('notHeld возвращает недостающие права в порядке входа', () => {
    expect(
      notHeld([Permission.ROLE_MANAGE], [Permission.ROLE_MANAGE, Permission.CORE_ADMIN]),
    ).toEqual([Permission.CORE_ADMIN]);
    expect(notHeld([], [])).toEqual([]);
  });

  it('permissionsDiff: добавленные и снятые', () => {
    expect(
      permissionsDiff(
        [Permission.TASK_CREATE, Permission.TASK_ASSIGN],
        [Permission.TASK_CREATE, Permission.WORKFLOW_MANAGE],
      ),
    ).toEqual({ added: [Permission.WORKFLOW_MANAGE], removed: [Permission.TASK_ASSIGN] });
  });

  it('uniquePermissions: без дублей, по алфавиту', () => {
    expect(
      uniquePermissions([
        Permission.WORKFLOW_MANAGE,
        Permission.TASK_CREATE,
        Permission.WORKFLOW_MANAGE,
      ]),
    ).toEqual([Permission.TASK_CREATE, Permission.WORKFLOW_MANAGE]);
  });

  it('catalogPermissions отбрасывает права вне каталога', () => {
    expect(catalogPermissions(['legacy.permission', Permission.DIRECTORY_READ])).toEqual([
      Permission.DIRECTORY_READ,
    ]);
  });
});
