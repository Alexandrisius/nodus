import { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REDIS_COMMAND_TIMEOUT_MS } from '../../core/redis/redis-command.js';
import { LoginThrottleService } from './login-throttle.service.js';

describe('LoginThrottleService', () => {
  const redis = {
    status: 'ready',
    get: vi.fn(),
    eval: vi.fn(),
    del: vi.fn(),
  };
  const logger = { setContext: vi.fn(), warn: vi.fn() };

  let service: LoginThrottleService;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.status = 'ready';
    service = new LoginThrottleService(redis as never, logger as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('блокирует после 10 неудач за окно', async () => {
    redis.get.mockResolvedValue('9');
    expect(await service.isLocked('a@b.by')).toBe(false);
    redis.get.mockResolvedValue('10');
    expect(await service.isLocked('a@b.by')).toBe(true);
  });

  it('неудача пишет счётчик и ставит окно 10 минут одним Lua-скриптом', async () => {
    redis.eval.mockResolvedValue(1);

    await service.recordFailure('Admin@Nodus.by');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      'nodus:auth:login_fail:admin@nodus.by',
      '600',
    );
    expect(redis.eval.mock.calls[0]![0]).toContain('EXPIRE');

    await service.recordFailure('Admin@Nodus.by');
    expect(redis.eval).toHaveBeenCalledTimes(2); // окно не продлеваем: условие в скрипте
  });

  it('reset удаляет счётчик', async () => {
    await service.reset('a@b.by');
    expect(redis.del).toHaveBeenCalledWith('nodus:auth:login_fail:a@b.by');
  });

  it('Redis не готов — вход не блокируется, команда не вызывается', async () => {
    redis.status = 'reconnecting';

    expect(await service.isLocked('a@b.by')).toBe(false);
    expect(redis.get).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('Redis завис — fail-open по таймауту, warn один раз', async () => {
    vi.useFakeTimers();
    redis.get.mockReturnValue(new Promise(() => undefined));

    const first = service.isLocked('a@b.by');
    const second = service.isLocked('a@b.by');
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS);

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('ошибка записи и сброса не мешает входу', async () => {
    redis.eval.mockRejectedValue(new Error('redis down'));
    redis.del.mockRejectedValue(new Error('redis down'));

    await expect(service.recordFailure('a@b.by')).resolves.toBeUndefined();
    await expect(service.reset('a@b.by')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('настоящий ioredis к закрытому порту — вход не висит', async () => {
    const realRedis = new Redis('redis://127.0.0.1:1', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: () => 1_000,
    });
    realRedis.on('error', () => undefined);
    try {
      const realService = new LoginThrottleService(realRedis as never, logger as never);
      const started = Date.now();
      expect(await realService.isLocked('a@b.by')).toBe(false);
      await realService.recordFailure('a@b.by');
      await realService.reset('a@b.by');
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      realRedis.disconnect();
    }
  });
});
