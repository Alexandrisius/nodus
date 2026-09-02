import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Redis } from 'ioredis';
import { lastValueFrom, of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../src/core/errors/domain-exception.js';
import { IdempotencyInterceptor } from '../../src/core/interceptors/idempotency.interceptor.js';

/**
 * Идемпотентность на реальном Redis (критерий приёмки issue #2):
 * повтор с тем же ключом → первый результат; иное тело → CONFLICT.
 */

function createContext(body: unknown, key: string) {
  const reply = {
    statusCode: 201,
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        url: '/api/v1/test',
        headers: { 'idempotency-key': key },
        body,
      }),
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
  return { context, reply };
}

describe.skipIf(!process.env.REDIS_URL)('idempotency (integration)', () => {
  let redis: Redis;
  let interceptor: IdempotencyInterceptor;
  const runId = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    interceptor = new IdempotencyInterceptor(
      redis as never,
      {
        setContext: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never,
    );
    await redis.ping();
  });

  afterAll(async () => {
    const keys = await redis.keys(`nodus:core:idempotency:*${runId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    redis.disconnect();
  });

  it('повтор с тем же ключом возвращает первый результат, мутация не исполняется дважды', async () => {
    const key = `it-${runId}-same`;
    let executions = 0;
    const next: CallHandler = {
      handle: () => {
        executions += 1;
        return of({ id: `created-${executions}` });
      },
    };

    const first = createContext({ title: 'Письмо' }, key);
    const firstResult = await lastValueFrom(await interceptor.intercept(first.context, next));
    expect(firstResult).toEqual({ id: 'created-1' });
    // tap-запись в Redis асинхронна — ждём микротаск
    await new Promise((resolve) => setImmediate(resolve));

    const second = createContext({ title: 'Письмо' }, key);
    const secondResult = await lastValueFrom(await interceptor.intercept(second.context, next));
    expect(secondResult).toEqual({ id: 'created-1' }); // первый результат
    expect(executions).toBe(1); // мутация исполнена один раз
    expect(second.reply.header).toHaveBeenCalledWith('Idempotent-Replay', 'true');
  });

  it('тот же ключ с иным телом → CONFLICT', async () => {
    const key = `it-${runId}-conflict`;
    const first = createContext({ title: 'A' }, key);
    await lastValueFrom(await interceptor.intercept(first.context, { handle: () => of({}) }));
    await new Promise((resolve) => setImmediate(resolve));

    const second = createContext({ title: 'B' }, key);
    await expect(interceptor.intercept(second.context, { handle: () => of({}) })).rejects.toSatisfy(
      (error: unknown) => error instanceof DomainException && error.code === ErrorCode.CONFLICT,
    );
  });
});
