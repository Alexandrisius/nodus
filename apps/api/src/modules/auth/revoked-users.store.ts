import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { REDIS_CLIENT } from '../../core/redis/redis.module.js';
import { getAuthConfig } from './auth.config.js';

/** Потолок ожидания Redis на горячем пути guard'а: общий клиент держит
 *  команды в offline-очереди без лимита (`maxRetriesPerRequest: null`), и без
 *  таймаута упавший Redis подвешивал бы каждый авторизованный запрос. */
const REDIS_TIMEOUT_MS = 300;
/** Запас к моменту деактивации: `createdAt` события — начало транзакции в
 *  часах PG, а refresh/login, прочитавший статус до её коммита, подпишет
 *  токен на миллисекунды позже (`iat` — часы Node, точность — секунда). */
const REVOKE_MARGIN_SECONDS = 5;
const WARN_EVERY_MS = 60_000;

/** SET только вперёд: повтор старого события (бэкофф диспетчера) не
 *  откатывает момент более позднего увольнения. */
const SET_MAX_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]))
if (not cur) or tonumber(ARGV[1]) > cur then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
end
return 1`;

class RedisTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RedisTimeoutError('Redis timeout')), REDIS_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Отзыв действующих access-токенов уволенного сотрудника (#333). Access-JWT
 * stateless (15 мин), поэтому после деактивации нужен стоп-лист:
 * `nodus:auth:revoked-before:<userId>` = момент деактивации + запас (секунды
 * epoch). Токен с `iat` не позже этого момента отвергается. TTL записи = TTL
 * access-токена + запас: к её истечению все токены, выданные до
 * деактивации, умерли сами, а новые не выдаются (вход и refresh проверяют
 * статус, сессии отозваны). Повторная активация не требует снятия записи:
 * новые токены выпущены позже (кроме первых секунд запаса — один 401 и
 * refresh).
 *
 * Недоступный Redis: проверка — fail-open с warn (не чаще раза в минуту):
 * окно возвращается к TTL токена, API не встаёт (Redis не готов → сразу
 * пропуск, завис → таймаут). Запись — ошибка: диспетчер повторит событие с
 * бэкоффом, а не повиснет.
 */
@Injectable()
export class RevokedUsersStore {
  private readonly ttlSeconds = getAuthConfig().accessTtlSeconds + 60;
  private lastWarnAt = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RevokedUsersStore.name);
  }

  private key(userId: string): string {
    return `nodus:auth:revoked-before:${userId}`;
  }

  /** Отзыв всех токенов, выданных не позже `at` (+ запас). */
  async revoke(userId: string, at: Date = new Date()): Promise<void> {
    if (this.redis.status !== 'ready') {
      throw new Error(`revoked-users: Redis не готов (${this.redis.status})`);
    }
    const seconds = Math.floor(at.getTime() / 1000) + REVOKE_MARGIN_SECONDS;
    await withTimeout(
      this.redis.eval(
        SET_MAX_SCRIPT,
        1,
        this.key(userId),
        String(seconds),
        String(this.ttlSeconds),
      ),
    );
  }

  /** Токен выдан до деактивации владельца → отозван. */
  async isRevoked(userId: string, issuedAtSeconds: number | undefined): Promise<boolean> {
    let raw: string | null;
    try {
      if (this.redis.status !== 'ready') throw new Error(`Redis не готов (${this.redis.status})`);
      raw = await withTimeout(this.redis.get(this.key(userId)));
    } catch (error) {
      this.warnThrottled(error);
      return false;
    }
    if (raw === null) return false;
    return issuedAtSeconds === undefined || issuedAtSeconds <= Number(raw);
  }

  private warnThrottled(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_EVERY_MS) return;
    this.lastWarnAt = now;
    this.logger.warn(
      { err: error },
      'revoked-users: Redis недоступен, проверка стоп-листа пропущена',
    );
  }
}
