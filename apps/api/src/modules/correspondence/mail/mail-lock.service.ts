import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

/**
 * Выделенное соединение для сессионного advisory-лока цикла приёма (#56;
 * код-ревью: лок/анлок поверх пула Prisma мог уходить в разные соединения —
 * лок «утекал», взаимное исключение не гарантировалось). Сессионный лок
 * привязан к соединению: пул из ОДНОГО pg-соединения гарантирует, что анлок
 * уйдёт туда же. Ключ — константа: второй процесс приёма не заводим.
 */
export const MAIL_SYNC_ADVISORY_LOCK = 9056n;

@Injectable()
export class MailSyncLock implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 60_000,
  });

  private held: PoolClient | null = null;

  /** Захватить лок цикла; false — приём уже ведёт другой процесс. */
  async tryAcquire(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [MAIL_SYNC_ADVISORY_LOCK.toString()],
      );
      if (!result.rows[0]?.locked) {
        client.release();
        return false;
      }
      // Соединение держим (не в пул) до release — анлок тем же соединением.
      this.held = client;
      return true;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async release(): Promise<void> {
    const client = this.held;
    this.held = null;
    if (!client) return;
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MAIL_SYNC_ADVISORY_LOCK.toString()]);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.release().catch(() => undefined);
    await this.pool.end().catch(() => undefined);
  }
}
