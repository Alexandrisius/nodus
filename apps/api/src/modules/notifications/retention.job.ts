import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { NotificationsRepository } from './notifications.repository.js';

export const RETENTION_QUEUE = 'notification-retention';
export const RETENTION_PREFIX = 'nodus';
/** Низкий приоритет старше N дней — авто-прочтение (анти-свалка; журнал жив). */
export const LOW_RETENTION_DAYS = 7;

/**
 * Ежедневная уборка низкого приоритета (#100, ADR-0016 §6): repeatable-джоб
 * BullMQ (cron 04:00, advanced-scheduled-tasks: никаких @nestjs/schedule).
 * Низкий старше 7 дней помечается прочитанным — счётчик точки чистится,
 * история остаётся в журнале (фильтр «Все»; серверный ?q= — до глобального
 * поиска топбара #172).
 */
@Injectable()
export class BackgroundRetentionJob implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<Record<string, never>>;
  private worker?: Worker<Record<string, never>>;

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BackgroundRetentionJob.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(RETENTION_QUEUE, {
      connection: this.connection,
      prefix: RETENTION_PREFIX,
    });
  }

  async onModuleInit(): Promise<void> {
    // Идемпотентная регистрация расписания: Job Scheduler API BullMQ 6
    // (опция repeat у add удалена) — upsert по стабильному id.
    await this.queue.upsertJobScheduler(
      'retention-daily',
      { pattern: '0 4 * * *' },
      {
        name: 'archive',
        data: {},
        opts: { removeOnComplete: 10, removeOnFail: 50 },
      },
    );
    this.worker = new Worker<Record<string, never>>(
      RETENTION_QUEUE,
      async () => {
        await this.runOnce();
      },
      { connection: this.duplicateConnection(), prefix: RETENTION_PREFIX, concurrency: 1 },
    );
    this.worker.on('failed', (_job, error) => {
      this.logger.warn({ err: error }, 'Уборка фона не удалась (повтор по расписанию)');
    });
  }

  /** Один проход архивации — public для тестов/e2e. */
  async runOnce(): Promise<number> {
    return this.repo.archiveStaleLow(LOW_RETENTION_DAYS);
  }

  private duplicateConnection(): Redis {
    return this.connection.duplicate();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.connection.disconnect();
  }
}
