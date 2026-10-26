import { Permission } from '@nodus/contracts';
import { describe, expect, it, vi } from 'vitest';

import { LetterFileAccess } from './letter-file-access.js';

const REGISTERED = [{ registeredAt: new Date('2026-10-01T08:00:00.000Z') }];
const UNREGISTERED = [{ registeredAt: null }];

function setup(letters: { registeredAt: Date | null }[], permissions: string[]) {
  const repo = { visibilityByFile: vi.fn(async () => letters) };
  const membership = { effectivePermissions: vi.fn(async () => permissions) };
  return { access: new LetterFileAccess(repo as never, membership as never), repo, membership };
}

describe('LetterFileAccess (#55, B5)', () => {
  it('файл зарегистрированного письма виден всем, правка запрещена', async () => {
    const { access } = setup(REGISTERED, []);
    expect(await access.check('file-1', 'u1')).toEqual({
      canView: true,
      canEdit: false,
      immutable: true,
    });
  });

  it('файл незарегистрированного письма — только держателю регистрации', async () => {
    const employee = setup(UNREGISTERED, []);
    expect(await employee.access.check('file-1', 'u1')).toEqual({
      canView: false,
      canEdit: false,
      immutable: true,
    });
    const registrar = setup(UNREGISTERED, [Permission.CORRESPONDENCE_REGISTER]);
    expect(await registrar.access.check('file-1', 'u1')).toEqual({
      canView: true,
      canEdit: false,
      immutable: true,
    });
  });

  it('файл вне писем — null (вклад контрибьютора отсутствует)', async () => {
    const { access, membership } = setup([], []);
    expect(await access.check('file-1', 'u1')).toBeNull();
    expect(membership.effectivePermissions).not.toHaveBeenCalled();
  });
});
