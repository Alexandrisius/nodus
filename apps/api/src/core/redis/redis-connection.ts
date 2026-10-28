import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';

const logger = new Logger('Redis');

/** Docker Desktop (Windows) рвёт idle TCP к контейнеру на published-порту
 *  примерно через 40 с (проба #507: ECONNRESET на 40.1/80.4/120.7 с простоя).
 *  PING каждые 20 с удерживает соединение; TCP keepAlive не помогает. */
export const REDIS_HEARTBEAT_MS = 20_000;
/** Ошибка соединения — одной строкой на клиента не чаще раза в 30 с: шторм
 *  переподключений не должен топить лог настоящими ошибками (#507). */
export const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;

export interface WatchRedisOptions {
  /** Прикладной heartbeat. Выключать для соединений с блокирующими командами
   *  (XREADGROUP/BZPOPMIN): PING встал бы за блокировкой. */
  heartbeat?: boolean;
}

/**
 * Именованное соединение Redis (#507): имя видно в `CLIENT LIST`, ошибки —
 * одной строкой с именем, heartbeat держит idle-сокет живым на Windows/Docker.
 * Использовать для всех долгоживущих клиентов; worker-дубликаты BullMQ —
 * `duplicateRedisClient` (без heartbeat: там блокирующие команды).
 */
export function createRedisClient(
  url: string,
  name: string,
  options: RedisOptions = {},
  watch: WatchRedisOptions = {},
): Redis {
  const client = new Redis(url, { connectionName: name, ...options });
  return watchRedisClient(client, name, watch);
}

export function watchRedisClient(
  client: Redis,
  name: string,
  { heartbeat = true }: WatchRedisOptions = {},
): Redis {
  // Троттлинг — по коду ошибки, а не по клиенту целиком (security-ревью #507):
  // шторм ECONNRESET гасим, но другая ошибка (WRONGPASS/NOAUTH/…) в том же
  // окне обязана попасть в лог — иначе auth-инцидент замаскируется шумом.
  const lastLoggedAt = new Map<string, number>();
  client.on('error', (error: Error & { code?: string }) => {
    const key = error.code ?? error.message;
    const now = Date.now();
    if (now - (lastLoggedAt.get(key) ?? 0) < REDIS_ERROR_LOG_INTERVAL_MS) return;
    lastLoggedAt.set(key, now);
    logger.warn(
      `Redis "${name}": ${error.message}${error.code ? ` (${error.code})` : ''}`,
      'RedisConnection',
    );
  });

  if (heartbeat) {
    const timer = setInterval(() => {
      void client.ping().catch(() => undefined);
    }, REDIS_HEARTBEAT_MS);
    timer.unref();
    client.on('end', () => clearInterval(timer));
  }
  return client;
}

/** Дубликат клиента для BullMQ-worker: своё имя и обработчик ошибок, без
 *  heartbeat (соединение занято блокирующими командами). */
export function duplicateRedisClient(client: Redis, name: string): Redis {
  const duplicate = client.duplicate({ connectionName: name });
  return watchRedisClient(duplicate, name, { heartbeat: false });
}
