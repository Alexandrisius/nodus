import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { of, tap, type Observable } from 'rxjs';
import { ErrorCode, type AuthUser } from '@nodus/contracts';

import { REQUEST_USER_KEY } from '../decorators/get-user.decorator.js';
import { DomainException } from '../errors/domain-exception.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { sha256Hex, stableStringify } from './stable-stringify.js';

/** TTL сохранённого ответа и замка (ADR-0005). */
const RESPONSE_TTL_SECONDS = 86_400; // 24 ч
const LOCK_TTL_SECONDS = 5;
const LOCK_WAIT_MS = 2_000;
const LOCK_POLL_MS = 100;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CachedResponse {
  statusCode: number;
  body: unknown;
  bodyHash: string;
}

/**
 * Идемпотентность мутаций (I7, ADR-0005): повтор с тем же `Idempotency-Key`
 * и тем же телом получает первый ответ (заголовок `Idempotent-Replay: true`),
 * с иным телом — CONFLICT. Ключ скоуплен актором+методом+путём+sha256(key).
 * Гонки закрыты замком SET NX; ошибки не кэшируются; недоступный Redis —
 * fail-open (запрос проходит, защита временно ослаблена, в лог — warn).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IdempotencyInterceptor.name);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }
    const keyHeader = request.headers['idempotency-key'];
    if (typeof keyHeader !== 'string' || keyHeader.length === 0) {
      return next.handle(); // заголовка нет — механизм не применяется
    }

    let scopedKey: string;
    let bodyHash: string;
    try {
      const user = (request as FastifyRequest & { [REQUEST_USER_KEY]?: AuthUser })[
        REQUEST_USER_KEY
      ];
      const actor = user?.id ?? 'anonymous';
      scopedKey = `nodus:core:idempotency:${actor}:${request.method}:${request.url.split('?')[0]}:${sha256Hex(keyHeader)}`;
      bodyHash = sha256Hex(stableStringify(request.body ?? null));
    } catch {
      return next.handle();
    }

    try {
      const cached = await this.redis.get(scopedKey);
      if (cached) {
        return this.replay(
          JSON.parse(cached) as CachedResponse,
          bodyHash,
          http.getResponse(),
          scopedKey,
        );
      }
      const lockAcquired = await this.redis.set(
        `${scopedKey}:lock`,
        '1',
        'EX',
        LOCK_TTL_SECONDS,
        'NX',
      );
      if (!lockAcquired) {
        const appeared = await this.waitForResult(scopedKey);
        if (appeared) {
          return this.replay(
            JSON.parse(appeared) as CachedResponse,
            bodyHash,
            http.getResponse(),
            scopedKey,
          );
        }
        // Победитель упал, не записав результат — исполняемся (страховка — ограничения БД).
      }
    } catch (error) {
      if (error instanceof DomainException) {
        throw error;
      }
      this.logger.warn({ err: error }, 'Idempotency store unavailable, failing open');
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          const reply = http.getResponse<FastifyReply>();
          if (reply.statusCode >= 200 && reply.statusCode < 300) {
            const record: CachedResponse = { statusCode: reply.statusCode, body, bodyHash };
            void this.redis
              .pipeline()
              .set(scopedKey, JSON.stringify(record), 'EX', RESPONSE_TTL_SECONDS)
              .del(`${scopedKey}:lock`)
              .exec()
              .catch((error: unknown) =>
                this.logger.warn({ err: error }, 'Failed to cache idempotent response'),
              );
          } else {
            void this.redis.del(`${scopedKey}:lock`).catch(() => undefined);
          }
        },
        error: () => {
          void this.redis.del(`${scopedKey}:lock`).catch(() => undefined);
        },
      }),
    );
  }

  /** Повтор с иным телом — CONFLICT с продлением TTL (переждать нельзя, ADR-0005). */
  private replay(
    cached: CachedResponse,
    bodyHash: string,
    reply: FastifyReply,
    scopedKey: string,
  ): Observable<unknown> {
    if (cached.bodyHash !== bodyHash) {
      void this.redis.expire(scopedKey, RESPONSE_TTL_SECONDS).catch(() => undefined);
      throw new DomainException(
        ErrorCode.CONFLICT,
        'Idempotency key was used with a different payload',
      );
    }
    void reply.status(cached.statusCode).header('Idempotent-Replay', 'true');
    return of(cached.body);
  }

  private async waitForResult(scopedKey: string): Promise<string | null> {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      const result = await this.redis.get(scopedKey);
      if (result) {
        return result;
      }
    }
    return null;
  }
}
