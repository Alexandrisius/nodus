import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { USER_FETCH_LIMIT_PER_HOUR } from './link-preview.guards.js';

/**
 * Per-user лимит внешних фетчей (#212, спека ~30/час): Redis-счётчик с
 * часовым окном. Отдельный класс — инжектится в сервис (unit-тесты мокают,
 * без живого соединения), соединение ленивое (первый фетч) и на разрушение.
 */
@Injectable()
export class LinkPreviewRateLimiter implements OnModuleDestroy {
  private connection: Redis | null = null;

  /** true — лимит не исчерпан (и счётчик увеличен). */
  async allow(userId: string): Promise<boolean> {
    this.connection ??= new Redis(process.env.REDIS_URL ?? '', {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    const key = `nodus:link-preview:fetches:${userId}`;
    const count = await this.connection.incr(key);
    if (count === 1) await this.connection.expire(key, 3600);
    return count <= USER_FETCH_LIMIT_PER_HOUR;
  }

  async onModuleDestroy(): Promise<void> {
    this.connection?.disconnect();
  }
}
