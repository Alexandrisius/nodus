import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { MailInboxService } from './mail-inbox.service.js';
import { MAIL_RECEPTION_CONFIG, type MailReceptionConfig } from './mail-reception.config.js';

export const MAIL_POLL_QUEUE = 'correspondence-mail-poll';
const PREFIX = 'nodus';

/**
 * Фолбэк-опрос общего ящика (#56, Р4, ADR-0035): Job Scheduler BullMQ каждые
 * `MAIL_POLL_MINUTES` (10) вызывает тот же `sync('poll')` — идемпотентен
 * курсором, поэтому IDLE и опрос не конфликтуют (мьютекс в сервисе).
 * Расписание регистрируется всегда: выключенный приём циклом пропускается —
 * рубильник главный, расписание лишь тикает.
 */
@Injectable()
export class MailPollJob implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<Record<string, never>>;
  private worker?: Worker<Record<string, never>>;

  constructor(
    private readonly inbox: MailInboxService,
    @Inject(MAIL_RECEPTION_CONFIG) private readonly config: MailReceptionConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MailPollJob.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(MAIL_POLL_QUEUE, { connection: this.connection, prefix: PREFIX });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'mail-poll',
      { every: this.config.pollMinutes * 60_000 },
      {
        name: 'sync',
        data: {},
        opts: { removeOnComplete: 10, removeOnFail: 50 },
      },
    );
    this.worker = new Worker<Record<string, never>>(
      MAIL_POLL_QUEUE,
      async () => {
        await this.inbox.sync('poll').catch((error: unknown) => {
          // Ошибка уже учтена аккумулятором сервиса; повтор — по расписанию.
          this.logger.warn({ err: error }, 'Фолбэк-опрос не удался');
        });
      },
      { connection: this.connection.duplicate(), prefix: PREFIX, concurrency: 1 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.connection.disconnect();
  }
}
