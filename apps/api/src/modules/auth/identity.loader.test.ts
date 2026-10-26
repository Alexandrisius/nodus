import { describe, expect, it, vi } from 'vitest';
import { Permission } from '@nodus/contracts';

import { IdentityLoader } from './identity.loader.js';

const PROFILE = {
  id: 'u1',
  email: 'u1@nodus.by',
  displayName: 'Сотрудник',
  status: 'active' as const,
};

/** Права — из порта ролей, профиль — из auth-репозитория (#379, ADR-0034 п. 4). */
describe('IdentityLoader', () => {
  it('профиль + права порта (прямые роли ∪ подразделение и предки)', async () => {
    const repo = { findProfileById: vi.fn(async () => PROFILE) };
    const membership = {
      effectivePermissions: vi.fn(async () => [Permission.TASK_CREATE]),
      effectiveRoleIds: vi.fn(),
    };

    const identity = await new IdentityLoader(repo as never, membership as never).load('u1');

    expect(identity).toEqual({ ...PROFILE, permissions: [Permission.TASK_CREATE] });
    expect(membership.effectivePermissions).toHaveBeenCalledWith('u1', undefined);
  });

  it('нет сотрудника → null, права не запрашиваются', async () => {
    const repo = { findProfileById: vi.fn(async () => null) };
    const membership = { effectivePermissions: vi.fn(), effectiveRoleIds: vi.fn() };

    await expect(
      new IdentityLoader(repo as never, membership as never).load('u1'),
    ).resolves.toBeNull();
    expect(membership.effectivePermissions).not.toHaveBeenCalled();
  });

  it('транзакция прокидывается в оба чтения', async () => {
    const repo = { findProfileById: vi.fn(async () => PROFILE) };
    const membership = { effectivePermissions: vi.fn(async () => []), effectiveRoleIds: vi.fn() };

    await new IdentityLoader(repo as never, membership as never).load('u1', 'tx' as never);

    expect(repo.findProfileById).toHaveBeenCalledWith('u1', 'tx');
    expect(membership.effectivePermissions).toHaveBeenCalledWith('u1', 'tx');
  });
});
