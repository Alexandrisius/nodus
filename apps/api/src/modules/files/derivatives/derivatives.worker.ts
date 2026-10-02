import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { DERIVATIVES_QUEUE, DERIVATIVES_QUEUE_PREFIX } from './derivatives.queue.js';
import { DerivativesService } from './derivatives.service.js';

/**
 * In-process BullMQ-воркер производных (#139, паттерн thumbnail #150):
 * тяжёлая конвертация живёт в очереди, не в HTTP. Concurrency 1 —
 * LibreOffice в Gotenberg тяжёл, очередь не рвёт общий хост. Ошибка —
 * статус failed + ретраи очереди (attempts 3); производная опциональна:
 * лента и просмотр живут без неё.
 */
@Injectable()
export class DerivativesWorker implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private worker?: Worker<{ fileId: string; version: number }>;

  constructor(
    private readonly service: DerivativesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DerivativesWorker.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
  }

  onModuleInit(): void {
    this.worker = new Worker<{ fileId: string; version: number }>(
      DERIVATIVES_QUEUE,
      async (job) => {
        await this.service.generatePdf(job.data.fileId, job.data.version);
      },
      { connection: this.connection, concurrency: 1, prefix: DERIVATIVES_QUEUE_PREFIX },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        {
          fileId: job?.data.fileId,
          version: job?.data.version,
          attempts: job?.attemptsMade,
          err: error,
        },
        'PDF-производная не сгенерирована (опционально — просмотр живёт на ONLYOFFICE)',
      );
      // Ретраи исчерпаны — фиксируем статус failed (наблюдаемость конвейера).
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        void this.service.markFailed(job.data.fileId, job.data.version, error);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection.disconnect();
  }
}
