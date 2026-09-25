import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { CHAT_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { fanoutCheckpointKey, RedisStreamPublisher } from './redis-stream-publisher.js';

/** Фейковый pipeline ioredis: собирает xadd-ы, exec управляем из теста. */
function fakeRedis() {
  const xadd = vi.fn();
  const pipeline = {
    xadd,
    exec: vi.fn(async () => [[null, '1-1']] as [Error | null, unknown][]),
  };
  return {
    get: vi.fn(async () => null as string | null),
    set: vi.fn(async () => 'OK'),
    multi: vi.fn(() => pipeline),
    pipeline,
    xadd,
  };
}

function makePublisher(redis: ReturnType<typeof fakeRedis>) {
  const queryRaw = vi.fn();
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() };
  const publisher = new RedisStreamPublisher(
    { $queryRaw: queryRaw } as never,
    redis as unknown as Redis,
    logger as never,
  );
  return { publisher, queryRaw, logger };
}
describe('RedisStreamPublisher', () => {
  let redis: ReturnType<typeof fakeRedis>;
  let queryRaw: ReturnType<typeof makePublisher>['queryRaw'];
  let logger: ReturnType<typeof makePublisher>['logger'];
  let publisher: RedisStreamPublisher;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/unit_nodus';
    redis = fakeRedis();
    ({ publisher, queryRaw, logger } = makePublisher(redis));
  });

  it('bootstrap без чекпоинта стартует с max(seq) и не публикует историю', async () => {
    queryRaw.mockResolvedValueOnce([{ max: 42n }]);
    await publisher.onModuleInit();
    publisher.onModuleDestroy();

    expect(redis.set).toHaveBeenCalledWith(
      fanoutCheckpointKey('postgresql://u:p@localhost:5432/unit_nodus'),
      '42',
    );
    // Публикация: пусто после чекпоинта — XADD нет.
    queryRaw.mockResolvedValueOnce([]);
    await publisher.publishPending();
    expect(redis.multi).not.toHaveBeenCalled();
  });

  it('bootstrap из сохранённого чекпоинта продолжает с него', async () => {
    redis.get.mockResolvedValueOnce('7');
    await publisher.onModuleInit();
    publisher.onModuleDestroy();

    expect(queryRaw).not.toHaveBeenCalledWith(expect.objectContaining({}));
    queryRaw.mockResolvedValueOnce([]);
    await publisher.publishPending();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('публикует батч envelope-ами по seq и двигает чекпоинт', async () => {
    redis.get.mockResolvedValueOnce('7');
    await publisher.onModuleInit();
    publisher.onModuleDestroy();

    const createdAt = new Date('2026-09-25T00:00:00.000Z');
    queryRaw.mockResolvedValueOnce([
      { seq: 8n, type: 'chat.message_sent', payload: { messageId: 'm1' }, createdAt },
      { seq: 9n, type: 'chat.message_read', payload: { upToSeq: 3 }, createdAt },
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
    expect(redis.set).toHaveBeenLastCalledWith(
      fanoutCheckpointKey('postgresql://u:p@localhost:5432/unit_nodus'),
      '9',
    );
  });

  it('ошибка Redis не двигает чекпоинт — батч повторится', async () => {
    redis.get.mockResolvedValueOnce('7');
    await publisher.onModuleInit();
    publisher.onModuleDestroy();

    redis.pipeline.exec.mockResolvedValueOnce([[new Error('boom'), null]] as [
      Error | null,
      unknown,
    ][]);
    queryRaw.mockResolvedValueOnce([
      { seq: 8n, type: 'chat.message_sent', payload: {}, createdAt: new Date() },
    ]);
    await publisher.publishPending();

    expect(logger.error).toHaveBeenCalled();
    // Чекпоинт не записан: bootstrap шёл из сохранённого '7', батч упал.
    expect(redis.set).not.toHaveBeenCalled();
  });
});
