import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { CHAT_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { RedisStreamPublisher } from './redis-stream-publisher.js';

/** Фейковый pipeline ioredis: собирает xadd-ы, exec управляем из теста. */
function fakeRedis() {
  const xadd = vi.fn();
  const pipeline = {
    xadd,
    exec: vi.fn(async () => [[null, '1-1']] as [Error | null, unknown][]),
  };
  return {
    multi: vi.fn(() => pipeline),
    pipeline,
    xadd,
  };
}

function makePublisher(redis: ReturnType<typeof fakeRedis>) {
  const queryRaw = vi.fn();
  const executeRaw = vi.fn(async () => 0);
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() };
  const publisher = new RedisStreamPublisher(
    { $queryRaw: queryRaw, $executeRaw: executeRaw } as never,
    redis as unknown as Redis,
    logger as never,
  );
  return { publisher, queryRaw, executeRaw, logger };
}

describe('RedisStreamPublisher', () => {
  let redis: ReturnType<typeof fakeRedis>;
  let queryRaw: ReturnType<typeof makePublisher>['queryRaw'];
  let executeRaw: ReturnType<typeof makePublisher>['executeRaw'];
  let publisher: RedisStreamPublisher;

  beforeEach(async () => {
    vi.clearAllMocks();
    redis = fakeRedis();
    ({ publisher, queryRaw, executeRaw } = makePublisher(redis));
    await publisher.onModuleInit();
    publisher.onModuleDestroy();
  });

  it('bootstrap помечает историю опубликованной — в стрим льётся только хвост', async () => {
    expect(executeRaw).toHaveBeenCalledTimes(1);
    // Публикация: хвост пуст — XADD нет.
    queryRaw.mockResolvedValueOnce([]);
    await publisher.publishPending();
    expect(redis.multi).not.toHaveBeenCalled();
  });

  it('публикует батч envelope-ами по seq и ставит метку fanout_at после XADD', async () => {
    const createdAt = new Date('2026-09-25T00:00:00.000Z');
    queryRaw.mockResolvedValueOnce([
      { id: 'e1', seq: 8n, type: 'chat.message_sent', payload: { messageId: 'm1' }, createdAt },
      { id: 'e2', seq: 9n, type: 'chat.message_read', payload: { upToSeq: 3 }, createdAt },
    ]);
    await publisher.publishPending();

    expect(redis.xadd).toHaveBeenCalledTimes(2);
    expect(redis.xadd).toHaveBeenNthCalledWith(
      1,
      CHAT_EVENTS_STREAM,
      'MAXLEN',
      '~',
      100_000,
      '*',
      'envelope',
      JSON.stringify({
        type: 'chat.message_sent',
        payload: { messageId: 'm1' },
        seq: 8,
        ts: createdAt.toISOString(),
      } satisfies RealtimeEnvelope),
    );
    // Bootstrap + метка батча.
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('ошибка Redis не ставит метку — батч повторится целиком', async () => {
    redis.pipeline.exec.mockResolvedValueOnce([[new Error('boom'), null]] as [
      Error | null,
      unknown,
    ][]);
    queryRaw.mockResolvedValueOnce([
      { id: 'e1', seq: 8n, type: 'chat.message_sent', payload: {}, createdAt: new Date() },
    ]);
    await publisher.publishPending();

    // Только bootstrap-метка: батч не помечен и повторится следующим тиком.
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
