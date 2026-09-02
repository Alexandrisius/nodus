import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

/** Токен подключения Redis (конвенция ключей — `nodus:<module>:*`). */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Общий клиент Redis: идемпотентность (ADR-0005), кэши; позже — BullMQ.
 * maxRetriesPerRequest=null + lazyConnect=false — стандарт для ioredis v5.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL;
        if (!url) {
          throw new Error('REDIS_URL не задан');
        }
        return new Redis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
