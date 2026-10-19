import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { REDIS_CLIENT } from '../../core/redis/redis.module.js';
import { getAuthConfig } from './auth.config.js';

/**
 * Отзыв действующих access-токенов уволенного сотрудника (#333). Access-JWT
 * stateless (15 мин), поэтому после деактивации нужен стоп-лист:
 * `nodus:auth:revoked-before:<userId>` = момент деактивации (секунды epoch).
 * Токен с `iat` не позже этого момента отвергается. TTL записи = TTL
 * access-токена + запас: к её истечению все токены, выданные до
 * деактивации, умерли сами, а новые не выдаются (вход и refresh проверяют
 * статус, сессии отозваны). Повторная активация не требует снятия записи:
 * новые токены выданы позже момента деактивации.
 *
 * Недоступный Redis — fail-open с warn: окно доступа возвращается к TTL
 * токена (прежнее поведение), а весь API из-за Redis не падает (как у
 * идемпотентности).
 */
@Injectable()
export class RevokedUsersStore {
  private readonly ttlSeconds = getAuthConfig().accessTtlSeconds + 60;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RevokedUsersStore.name);
  }

  private key(userId: string): string {
    return `nodus:auth:revoked-before:${userId}`;
  }

  /** Отзыв всех токенов, выданных не позже `at` (по умолчанию — сейчас). */
  async revoke(userId: string, at: Date = new Date()): Promise<void> {
    const seconds = Math.floor(at.getTime() / 1000);
    await this.redis.set(this.key(userId), String(seconds), 'EX', this.ttlSeconds);
  }

  /** Токен выдан до деактивации владельца → отозван. */
  async isRevoked(userId: string, issuedAtSeconds: number | undefined): Promise<boolean> {
    let raw: string | null;
    try {
      raw = await this.redis.get(this.key(userId));
    } catch (error) {
      this.logger.warn({ err: error }, 'revoked-users: Redis недоступен, проверка пропущена');
      return false;
    }
    if (raw === null) return false;
    return issuedAtSeconds === undefined || issuedAtSeconds <= Number(raw);
  }
}
