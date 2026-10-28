import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  REDIS_ERROR_LOG_INTERVAL_MS,
  REDIS_HEARTBEAT_MS,
  watchRedisClient,
} from './redis-connection.js';

class FakeRedis extends EventEmitter {
  ping = vi.fn().mockResolvedValue('PONG');
}

function fake(): { client: FakeRedis; watched: FakeRedis } {
  const client = new FakeRedis();
  return { client, watched: watchRedisClient(client as never, 'test') as unknown as FakeRedis };
}

describe('watchRedisClient: heartbeat и нешумный лог (#507)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('PING каждые 20 с держит idle-соединение', () => {
    vi.useFakeTimers();
    const { client } = fake();

    vi.advanceTimersByTime(REDIS_HEARTBEAT_MS - 1);
    expect(client.ping).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(client.ping).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REDIS_HEARTBEAT_MS);
    expect(client.ping).toHaveBeenCalledTimes(2);
  });

  it('ошибки — одной строкой на клиента не чаще раза в 30 с', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { client } = fake();

    client.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    client.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    expect(warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(REDIS_ERROR_LOG_INTERVAL_MS + 1);
    client.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('другая ошибка в окне троттлинга не тонет (auth-коды, security-ревью #507)', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { client } = fake();

    client.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    client.emit(
      'error',
      Object.assign(new Error('WRONGPASS invalid username-password'), { code: 'WRONGPASS' }),
    );
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1]?.[0])).toContain('WRONGPASS');
  });

  it('heartbeat не ставится для соединений с блокирующими командами', () => {
    vi.useFakeTimers();
    const client = new FakeRedis();
    watchRedisClient(client as never, 'blocking', { heartbeat: false });

    vi.advanceTimersByTime(REDIS_HEARTBEAT_MS * 3);
    expect(client.ping).not.toHaveBeenCalled();
  });
});
