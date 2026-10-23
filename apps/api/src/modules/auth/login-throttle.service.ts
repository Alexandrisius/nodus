import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { runRedisCommand } from '../../core/redis/redis-command.js';
import { REDIS_CLIENT } from '../../core/redis/redis.module.js';

/** Окно и порог пер-аккаунтного ограничения входа (OWASP throttling). */
const WINDOW_SECONDS = 10 * 60;
const MAX_FAILURES = 10;
const WARN_EVERY_MS = 60_000;

/** INCR+EXPIRE одной командой: сбой между ними оставил бы счётчик без TTL —
 *  вечная блокировка учётки после десяти неудач. */
const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count`;

const keyFor = (email: string): string => `nodus:auth:login_fail:${email.toLowerCase()}`;

/**
 * Счётчик неудачных входов по учётке (Redis, cache-aside конвенция ключей
 * `nodus:<module>:`). Защита от брутфорса, устойчивая к NAT: ограничиваем
 * аккаунт, а не IP офиса. Сброс — при успешном входе.
 *
 * Недоступный Redis: fail-open с warn (не чаще раза в минуту) — вход не
 * блокируется, защита от перебора временно ослаблена. Fail-closed сделал бы
 * портал недоступным при отказе Redis; для self-hosted контура доступность
 * важнее, окно ослабления ограничено временем восстановления Redis.
 */
@Injectable()
export class LoginThrottleService {
  private lastWarnAt = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoginThrottleService.name);
  }

  /** true — вход временно заблокирован (≥ MAX_FAILURES за окно). */
  async isLocked(email: string): Promise<boolean> {
    try {
      const count = await runRedisCommand(this.redis, () => this.redis.get(keyFor(email)));
      return count !== null && Number(count) >= MAX_FAILURES;
    } catch (error) {
      this.warnThrottled(error);
      return false;
    }
  }

  /** Фиксирует неудачу; INCR+EXPIRE выполняются одним Lua-скриптом. */
  async recordFailure(email: string): Promise<void> {
    try {
      await runRedisCommand(this.redis, () =>
        this.redis.eval(RECORD_FAILURE_SCRIPT, 1, keyFor(email), String(WINDOW_SECONDS)),
      );
    } catch (error) {
      this.warnThrottled(error);
    }
  }

  async reset(email: string): Promise<void> {
    try {
      await runRedisCommand(this.redis, () => this.redis.del(keyFor(email)));
    } catch (error) {
      this.warnThrottled(error);
    }
  }

  private warnThrottled(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_EVERY_MS) return;
    this.lastWarnAt = now;
    this.logger.warn(
      { err: error },
      'login-throttle: Redis недоступен, защита от перебора временно не применяется',
    );
  }
}
