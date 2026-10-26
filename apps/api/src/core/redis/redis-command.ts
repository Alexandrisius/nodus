import type { Redis } from 'ioredis';

/** Потолок ожидания Redis на горячем пути API: общий клиент держит команды
 *  в offline-очереди без лимита (`maxRetriesPerRequest: null`), поэтому без
 *  собственного таймаута упавший Redis подвешивает запрос навсегда. */
export const REDIS_COMMAND_TIMEOUT_MS = 300;

export class RedisUnavailableError extends Error {
  constructor(status: string) {
    super(`Redis не готов (${status})`);
    this.name = 'RedisUnavailableError';
  }
}

export class RedisTimeoutError extends Error {
  constructor() {
    super(`Redis не ответил за ${REDIS_COMMAND_TIMEOUT_MS} мс`);
    this.name = 'RedisTimeoutError';
  }
}

/**
 * Команда Redis с гарантией завершения:
 * - связь не `ready` — сразу ошибка, команду не ставим в offline-очередь;
 * - команда зависла — ошибка через REDIS_COMMAND_TIMEOUT_MS.
 *
 * Нужен для fail-open/fail-fast веток: ioredis с `maxRetriesPerRequest: null`
 * не бросает при обрыве, а ждёт восстановления — без этого хелпера catch
 * недостижим, и запрос висит.
 */
export async function runRedisCommand<T>(redis: Redis, command: () => Promise<T>): Promise<T> {
  if (redis.status !== 'ready') {
    throw new RedisUnavailableError(redis.status);
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      command(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RedisTimeoutError()), REDIS_COMMAND_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
