import { describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';

const { RevokedUsersStore } = await import('./revoked-users.store.js');

function makeStore(redis: { get: unknown; set?: unknown }) {
  const logger = { setContext: vi.fn(), warn: vi.fn() };
  return { store: new RevokedUsersStore(redis as never, logger as never), logger };
}

/** Стоп-лист уволенных (#333): токен, выданный до деактивации, отвергается. */
describe('RevokedUsersStore', () => {
  it('revoke пишет момент деактивации (секунды) с TTL access + 60 с', async () => {
    const set = vi.fn();
    const { store } = makeStore({ get: vi.fn(), set });
    await store.revoke('u1', new Date('2026-10-19T10:00:00.900Z'));
    expect(set).toHaveBeenCalledWith(
      'nodus:auth:revoked-before:u1',
      String(Date.UTC(2026, 9, 19, 10) / 1000),
      'EX',
      expect.any(Number),
    );
    expect(set.mock.calls[0]![3]).toBeGreaterThan(60);
  });

  it('токен выдан до/в момент деактивации — отозван; после (повторная активация) — нет', async () => {
    const { store } = makeStore({ get: vi.fn(async () => '1000') });
    expect(await store.isRevoked('u1', 999)).toBe(true);
    expect(await store.isRevoked('u1', 1000)).toBe(true);
    expect(await store.isRevoked('u1', 1001)).toBe(false);
    expect(await store.isRevoked('u1', undefined)).toBe(true);
  });

  it('записи нет — не отозван', async () => {
    const { store } = makeStore({ get: vi.fn(async () => null) });
    expect(await store.isRevoked('u1', 1)).toBe(false);
  });

  it('Redis недоступен — fail-open с warn', async () => {
    const { store, logger } = makeStore({
      get: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });
    expect(await store.isRevoked('u1', 1)).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
