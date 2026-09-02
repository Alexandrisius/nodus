import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../errors/domain-exception.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { sha256Hex, stableStringify } from './stable-stringify.js';

function createContext(options: {
  method?: string;
  body?: unknown;
  key?: string;
  statusCode?: number;
}) {
  const reply = {
    statusCode: options.statusCode ?? 201,
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: options.method ?? 'POST',
        url: '/api/v1/tasks',
        headers: options.key ? { 'idempotency-key': options.key } : {},
        body: options.body ?? { title: 'Задача' },
      }),
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
  return { context, reply };
}

function createNext(body: unknown = { id: 't1' }): CallHandler {
  return { handle: () => of(body) };
}

function createRedis() {
  const pipeline = {
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue(pipeline),
    _pipeline: pipeline,
  };
}

const KEY = 'client-key-1';
const BODY = { title: 'Задача' };
const SCOPED = `nodus:core:idempotency:anonymous:POST:/api/v1/tasks:${sha256Hex(KEY)}`;

let redis: ReturnType<typeof createRedis>;
let interceptor: IdempotencyInterceptor;

beforeEach(() => {
  redis = createRedis();
  const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() };
  interceptor = new IdempotencyInterceptor(redis as never, logger as never);
});

describe('IdempotencyInterceptor', () => {
  it('GET-запросы проходят мимо механизма', async () => {
    const { context } = createContext({ method: 'GET', key: KEY });
    const next = createNext();
    await interceptor.intercept(context, next);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('без заголовка Idempotency-Key — мимо механизма', async () => {
    const { context } = createContext({});
    await interceptor.intercept(context, createNext());
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('replay: тот же ключ и тело → первый ответ с Idempotent-Replay', async () => {
    const cached = {
      statusCode: 201,
      body: { id: 't1' },
      bodyHash: sha256Hex(stableStringify(BODY)),
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));
    const { context, reply } = createContext({ key: KEY, body: BODY });
    const next = createNext({ id: 't2' }); // не должен быть вызван

    const result$ = await interceptor.intercept(context, next);
    expect(await lastValueFrom(result$)).toEqual({ id: 't1' });
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.header).toHaveBeenCalledWith('Idempotent-Replay', 'true');
  });

  it('тот же ключ с иным телом → CONFLICT и продление TTL', async () => {
    const cached = { statusCode: 201, body: {}, bodyHash: sha256Hex('{"other":true}') };
    redis.get.mockResolvedValue(JSON.stringify(cached));
    const { context } = createContext({ key: KEY, body: BODY });

    await expect(interceptor.intercept(context, createNext())).rejects.toSatisfy(
      (error: unknown) => error instanceof DomainException && error.code === ErrorCode.CONFLICT,
    );
    expect(redis.expire).toHaveBeenCalledWith(SCOPED, 86400);
  });

  it('первый запрос: исполняется и кэширует 2xx-ответ', async () => {
    const { context } = createContext({ key: KEY, body: BODY });
    const result$ = await interceptor.intercept(context, createNext({ id: 't1' }));
    expect(await lastValueFrom(result$)).toEqual({ id: 't1' });
    expect(redis.set).toHaveBeenCalledWith(`${SCOPED}:lock`, '1', 'EX', 5, 'NX');
    expect(redis.pipeline).toHaveBeenCalled();
    expect(redis._pipeline.set).toHaveBeenCalledWith(
      SCOPED,
      expect.stringContaining('"statusCode":201'),
      'EX',
      86400,
    );
  });

  it('недоступный Redis → fail-open, запрос исполняется', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));
    const { context } = createContext({ key: KEY, body: BODY });
    const result$ = await interceptor.intercept(context, createNext({ id: 't9' }));
    expect(await lastValueFrom(result$)).toEqual({ id: 't9' });
  });
});
