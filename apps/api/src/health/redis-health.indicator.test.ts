import { afterEach, describe, expect, it, vi } from 'vitest';

import { REDIS_COMMAND_TIMEOUT_MS } from '../core/redis/redis-command.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

function createIndicator() {
  const result = {
    up: vi.fn(() => ({ redis: { status: 'up' } })),
    down: vi.fn(() => ({ redis: { status: 'down' } })),
  };
  const service = { check: vi.fn(() => result) };
  return { result, service };
}

describe('RedisHealthIndicator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('готовый Redis и PING → up', async () => {
    const { result, service } = createIndicator();
    const redis = { status: 'ready', ping: vi.fn().mockResolvedValue('PONG') };
    const indicator = new RedisHealthIndicator(redis as never, service as never);

    await expect(indicator.isHealthy('redis')).resolves.toEqual({ redis: { status: 'up' } });
    expect(result.up).toHaveBeenCalledTimes(1);
    expect(result.down).not.toHaveBeenCalled();
  });

  it('Redis не готов → down, PING не вызывается', async () => {
    const { result, service } = createIndicator();
    const redis = { status: 'reconnecting', ping: vi.fn() };
    const indicator = new RedisHealthIndicator(redis as never, service as never);

    await expect(indicator.isHealthy('redis')).resolves.toEqual({ redis: { status: 'down' } });
    expect(result.down).toHaveBeenCalledWith({ message: 'connection failed' });
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('PING завис → down по таймауту', async () => {
    vi.useFakeTimers();
    const { result, service } = createIndicator();
    const redis = { status: 'ready', ping: vi.fn(() => new Promise(() => undefined)) };
    const indicator = new RedisHealthIndicator(redis as never, service as never);

    const pending = indicator.isHealthy('redis');
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ redis: { status: 'down' } });
    expect(result.down).toHaveBeenCalledTimes(1);
  });

  it('PING ошибся → down', async () => {
    const { result, service } = createIndicator();
    const redis = { status: 'ready', ping: vi.fn().mockRejectedValue(new Error('boom')) };
    const indicator = new RedisHealthIndicator(redis as never, service as never);

    await expect(indicator.isHealthy('redis')).resolves.toEqual({ redis: { status: 'down' } });
    expect(result.down).toHaveBeenCalledTimes(1);
  });
});
