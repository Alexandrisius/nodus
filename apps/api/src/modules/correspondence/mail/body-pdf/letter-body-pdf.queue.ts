import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

/** Имя без двоеточий (BullMQ, урок #157); префикс nodus (конвенция). */
export const BODY_PDF_QUEUE = 'correspondence-body-pdf';
export const BODY_PDF_QUEUE_PREFIX = 'nodus';

/**
 * Продюсер очереди PDF-копий тела письма («Основной документ письма» #56):
 * конвертация — тяжёлая работа, только очередь (паттерн производных #139).
 * Добавление best-effort с warn-логом: недоступный Redis не валит приём.
 */
@Injectable()
export class LetterBodyPdfQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<{ letterId: string }>;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LetterBodyPdfQueue.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(BODY_PDF_QUEUE, {
      connection: this.connection,
      prefix: BODY_PDF_QUEUE_PREFIX,
    });
  }

  /** jobId = letter-body-pdf-<id> — идемпотентность: повторная постановка
   *  (приём + backfill) не плодит дубли; дубль по роли страхует unique. */
  async enqueue(letterId: string): Promise<void> {
    try {
      await this.queue.add(
        'body-pdf',
        { letterId },
        {
          jobId: `letter-body-pdf-${letterId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      this.logger.warn(
        { letterId, err: error },
        'Постановка PDF-копии тела не удалась (не критично)',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
