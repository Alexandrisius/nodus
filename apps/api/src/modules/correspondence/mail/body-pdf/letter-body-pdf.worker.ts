import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import {
  BODY_PDF_QUEUE,
  BODY_PDF_QUEUE_PREFIX,
  LetterBodyPdfQueue,
} from './letter-body-pdf.queue.js';
import { LetterBodyPdfService } from './letter-body-pdf.service.js';

/**
 * In-process BullMQ-воркер PDF-копий тела («Основной документ письма» #56,
 * паттерн производных #139): конвертация тяжёлая — живёт в очереди, не в
 * цикле приёма. Concurrency 1 (Chromium в Gotenberg тяжёл — общий хост).
 * Отказ — ретраи очереди; исчерпаны — флаг письма `mailBodyPdfIssue`
 * (кандидат недоступен, письмо живёт). На старте — backfill: письма с телом
 * без копии получают задачу (деплой на данные, где конвейера ещё не было).
 */
@Injectable()
export class LetterBodyPdfWorker implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private worker?: Worker<{ letterId: string }>;

  constructor(
    private readonly service: LetterBodyPdfService,
    private readonly queue: LetterBodyPdfQueue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LetterBodyPdfWorker.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
  }

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<{ letterId: string }>(
      BODY_PDF_QUEUE,
      async (job) => {
        await this.service.convert(job.data.letterId);
      },
      { connection: this.connection, concurrency: 1, prefix: BODY_PDF_QUEUE_PREFIX },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        { letterId: job?.data.letterId, attempts: job?.attemptsMade, err: error },
        'PDF-копия тела не создана (ретраи очереди)',
      );
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        void this.service.markIssue(job.data.letterId, error);
      }
    });
    await this.backfill();
  }

  /** Стартовый прогон backlog: конвертер мог отсутствовать при приёме этих
   *  писем (или фичи ещё не было). Идемпотентность — дедуп jobId + роль. */
  private async backfill(): Promise<void> {
    try {
      const letterIds = await this.service.backlogLetterIds();
      for (const letterId of letterIds) await this.queue.enqueue(letterId);
      if (letterIds.length > 0) {
        this.logger.info({ count: letterIds.length }, 'Backfill PDF-копий тела');
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'Backfill PDF-копий тела не удался (не критично)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection.disconnect();
  }
}
