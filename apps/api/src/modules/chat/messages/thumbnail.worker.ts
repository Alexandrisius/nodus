import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { THUMBNAIL_QUEUE } from './thumbnail.queue.js';
import { ThumbnailService } from './thumbnail.service.js';

/**
 * In-process BullMQ-воркер превью (#150, ADR-0015): модульный монолит (I1) —
 * отдельного контейнера-воркера нет, очередь снимает «тяжесть» с HTTP
 * (правило: HTTP-запрос тяжёлую работу не выполняет). Concurrency 2 —
 * ресайз упирается в CPU, больше плодить на общем хосте незачем. Недоступный
 * Redis на старте — не фатален: воркер переподключается сам, загрузки
 * вложений живут (enqueue — best-effort).
 */
@Injectable()
export class ThumbnailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private worker?: Worker<{ attachmentId: string; fileId: string }>;

  constructor(
    private readonly service: ThumbnailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ThumbnailWorker.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
  }

  onModuleInit(): void {
    this.worker = new Worker<{ attachmentId: string; fileId: string }>(
      THUMBNAIL_QUEUE,
      async (job) => {
        await this.service.generateFor(job.data.attachmentId);
      },
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        { attachmentId: job?.data.attachmentId, attempts: job?.attemptsMade, err: error },
        'Генерация превью не удалась (превью опционально — лента живёт на оригинале)',
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection.disconnect();
  }
}
