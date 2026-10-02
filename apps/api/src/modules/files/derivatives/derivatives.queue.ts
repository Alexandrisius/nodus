import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

/** Имя без двоеточий (BullMQ, урок #157); префикс nodus (конвенция). */
export const DERIVATIVES_QUEUE = 'files-derivatives';
export const DERIVATIVES_QUEUE_PREFIX = 'nodus';

/**
 * Продюсер очереди производных (#139): конвертация офисных в PDF (Gotenberg)
 * — тяжёлая работа только в очереди. Добавление best-effort с warn-логом
 * (паттерн thumbnail #150): недоступный Redis не валит отправку сообщения.
 */
@Injectable()
export class DerivativesQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<{ fileId: string; version: number }>;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(DerivativesQueue.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(DERIVATIVES_QUEUE, {
      connection: this.connection,
      prefix: DERIVATIVES_QUEUE_PREFIX,
    });
  }

  /** jobId = deriv-<fileId>-v<version> — идемпотентность: повторная
   * постановка (ретрай сообщения, backfill) не плодит дубли. */
  async enqueuePdf(fileId: string, version: number): Promise<void> {
    try {
      await this.queue.add(
        'pdf',
        { fileId, version },
        {
          jobId: `deriv-${fileId}-v${version}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      this.logger.warn(
        { fileId, version, err: error },
        'Постановка PDF-производной не удалась (не критично)',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
