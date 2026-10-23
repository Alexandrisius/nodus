import { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  REDIS_COMMAND_TIMEOUT_MS,
  RedisTimeoutError,
  RedisUnavailableError,
  runRedisCommand,
} from './redis-command.js';

describe('runRedisCommand', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('не готовая связь — сразу ошибка, команда не выполняется', async () => {
    const command = vi.fn(async () => 'PONG');
    await expect(
      runRedisCommand({ status: 'reconnecting' } as never, command),
    ).rejects.toBeInstanceOf(RedisUnavailableError);
    expect(command).not.toHaveBeenCalled();
  });

  it('готовая связь — возвращает результат команды', async () => {
    await expect(runRedisCommand({ status: 'ready' } as never, async () => 'PONG')).resolves.toBe(
      'PONG',
    );
  });

  it('зависшая команда — ошибка по таймауту', async () => {
    vi.useFakeTimers();
    const pending = runRedisCommand(
      { status: 'ready' } as never,
      () => new Promise(() => undefined),
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(RedisTimeoutError);
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS);
    await assertion;
  });

  it('настоящий ioredis к закрытому порту — команда не висит', async () => {
    const redis = new Redis('redis://127.0.0.1:1', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: () => 1_000,
    });
    redis.on('error', () => undefined);
    try {
      const started = Date.now();
      await expect(runRedisCommand(redis, () => redis.get('probe'))).rejects.toBeInstanceOf(
        RedisUnavailableError,
      );
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      redis.disconnect();
    }
  });
});
