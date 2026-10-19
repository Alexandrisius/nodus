import { describe, expect, it, vi } from 'vitest';

import { LocalAuthProvider } from './local-auth.provider.js';

const CREDENTIALS = { id: 'u1', passwordHash: 'hash', status: 'active' as const };
const IDENTITY = { id: 'u1', email: 'u1@nodus.by', displayName: 'Сотрудник', permissions: [] };

function makeProvider(identityStatus: 'active' | 'deactivated') {
  const repo = {
    findCredentialsByEmail: vi.fn(async () => CREDENTIALS),
    findIdentityById: vi.fn(async () => ({ ...IDENTITY, status: identityStatus })),
    updatePassword: vi.fn(),
  };
  const passwords = { verify: vi.fn(async () => true), needsRehash: vi.fn(() => false) };
  return new LocalAuthProvider(repo as never, passwords as never);
}

/** Деактивация, закоммиченная во время argon2, не выпускает токен (#333). */
describe('LocalAuthProvider', () => {
  it('активен и до, и после проверки пароля — identity', async () => {
    await expect(
      makeProvider('active').verifyCredentials('u1@nodus.by', 'p'),
    ).resolves.toMatchObject({ id: 'u1' });
  });

  it('деактивирован во время проверки пароля — null', async () => {
    await expect(
      makeProvider('deactivated').verifyCredentials('u1@nodus.by', 'p'),
    ).resolves.toBeNull();
  });
});
