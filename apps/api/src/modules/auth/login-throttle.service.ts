import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../core/redis/redis.module.js';

/** Окно и порог пер-аккаунтного ограничения входа (OWASP throttling). */
const WINDOW_SECONDS = 10 * 60;
const MAX_FAILURES = 10;

const keyFor = (email: string): string => `nodus:auth:login_fail:${email.toLowerCase()}`;

/**
 * Счётчик неудачных входов по учётке (Redis, cache-aside конвенция ключей
 * `nodus:<module>:`). Защита от брутфорса, устойчивая к NAT: ограничиваем
 * аккаунт, а не IP офиса. Сброс — при успешном входе.
 */
@Injectable()
export class LoginThrottleService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** true — вход временно заблокирован (≥ MAX_FAILURES за окно). */
  async isLocked(email: string): Promise<boolean> {
    const count = await this.redis.get(keyFor(email));
    return count !== null && Number(count) >= MAX_FAILURES;
  }

  /** Фиксирует неудачу; INCR+EXPIRE атомарны для целей троттлинга. */
  async recordFailure(email: string): Promise<void> {
    const key = keyFor(email);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(keyFor(email));
  }
}
