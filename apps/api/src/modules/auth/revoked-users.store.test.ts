import { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';

const { RevokedUsersStore } = await import('./revoked-users.store.js');

function makeStore(redis: Record<string, unknown>) {
  const logger = { setContext: vi.fn(), warn: vi.fn() };
  return {
    store: new RevokedUsersStore({ status: 'ready', ...redis } as never, logger as never),
    logger,
  };
}

/** Стоп-лист уволенных (#333): токен, выданный до деактивации, отвергается. */
describe('RevokedUsersStore', () => {
  it('revoke: момент + запас 5 с, только вперёд (скрипт max), TTL access + 60 с', async () => {
    const evalFn = vi.fn(async () => 1);
    const { store } = makeStore({ eval: evalFn });
    await store.revoke('u1', new Date('2026-10-19T10:00:00.900Z'));
    const [script, keys, key, seconds, ttl] = evalFn.mock.calls[0] as unknown as [
      string,
      number,
      string,
      string,
      string,
    ];
    expect(script).toContain('> cur');
    expect(keys).toBe(1);
    expect(key).toBe('nodus:auth:revoked-before:u1');
    expect(Number(seconds)).toBe(Date.UTC(2026, 9, 19, 10) / 1000 + 5);
    expect(Number(ttl)).toBeGreaterThan(60);
  });

  it('revoke при неготовом Redis — ошибка (диспетчер повторит), не зависание', async () => {
    const { store } = makeStore({ status: 'reconnecting', eval: vi.fn() });
    await expect(store.revoke('u1')).rejects.toThrow(/не готов/);
  });

  it('токен выдан до/в момент — отозван; после (повторная активация) — нет', async () => {
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

  it('Redis завис (команда в очереди без ответа) — fail-open по таймауту, warn один раз', async () => {
    const { store, logger } = makeStore({ get: vi.fn(() => new Promise(() => undefined)) });
    const started = Date.now();
    expect(await store.isRevoked('u1', 1)).toBe(false);
    expect(await store.isRevoked('u1', 1)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('настоящий ioredis к закрытому порту (настройки общего клиента) — guard не висит', async () => {
    const redis = new Redis('redis://127.0.0.1:1', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: () => 1_000,
    });
    try {
      const logger = { setContext: vi.fn(), warn: vi.fn() };
      const store = new RevokedUsersStore(redis as never, logger as never);
      const started = Date.now();
      expect(await store.isRevoked('u1', 1)).toBe(false);
      expect(Date.now() - started).toBeLessThan(1_000);
      await expect(store.revoke('u1')).rejects.toThrow();
    } finally {
      redis.disconnect();
    }
  });
});
