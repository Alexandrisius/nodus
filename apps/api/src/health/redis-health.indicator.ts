import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../core/redis/redis.module.js';

/** Готовность Redis: PING (без internals наружу). */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicator.check(key);
    try {
      await this.redis.ping();
      return indicator.up();
    } catch {
      return indicator.down({ message: 'connection failed' });
    }
  }
}
