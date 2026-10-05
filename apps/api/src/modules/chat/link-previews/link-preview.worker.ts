import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import {
  LINK_PREVIEW_QUEUE,
  LINK_PREVIEW_QUEUE_PREFIX,
  type LinkPreviewJob,
} from './link-preview.queue.js';
import { LinkPreviewService } from './link-preview.service.js';

/**
 * In-process BullMQ-воркер превью ссылок (#212, ADR-0018; паттерн
 * ThumbnailWorker): модульный монолит (I1), очередь снимает внешний фетч с
 * HTTP. Concurrency 2: таймаут 8с × редиректы — больше незачем (общий хост).
 * Недоступный Redis на старте не фатален (переподключение BullMQ).
 */
@Injectable()
export class LinkPreviewWorker implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private worker?: Worker<LinkPreviewJob>;

  constructor(
    private readonly service: LinkPreviewService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LinkPreviewWorker.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
  }

  onModuleInit(): void {
    this.worker = new Worker<LinkPreviewJob>(
      LINK_PREVIEW_QUEUE,
      async (job) => {
        await this.service.processJob(job.data);
      },
      { connection: this.connection, concurrency: 2, prefix: LINK_PREVIEW_QUEUE_PREFIX },
    );
    this.worker.on('failed', (job, error) => {
      // Превью опционально: лента живёт текстом, кэш — отрицательный.
      this.logger.warn(
        { normalizedUrl: job?.data.normalizedUrl, attempts: job?.attemptsMade, err: error },
        'Превью ссылки: задача не удалась',
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection.disconnect();
  }
}
