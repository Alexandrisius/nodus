import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

/** Очередь превью: ИМЯ без двоеточий (BullMQ запрещает ':' в имени — api падал
 *  на старте, поймано CI PR #157), префикс ключей Redis — 'nodus' (конвенция
 *  `nodus:<queue>:*` сохраняется: nodus:chat-thumbnail:*). */
export const THUMBNAIL_QUEUE = 'chat-thumbnail';
export const THUMBNAIL_QUEUE_PREFIX = 'nodus';

/**
 * Продюсер очереди превью вложений (#150, ADR-0015): BullMQ поверх
 * REDIS_URL — первый потребитель BullMQ в api (правило «тяжёлая обработка —
 * только очередь»: ресайз sharp не живёт в HTTP-запросе загрузки).
 * Выделенное соединение: BullMQ требует maxRetriesPerRequest=null и не
 * должен делить блокирующие команды с общим REDIS_CLIENT. Добавление job —
 * best-effort: недоступный Redis НЕ валит загрузку вложения (превью
 * опционально — лента живёт на оригинале с детерминированной геометрией).
 */
@Injectable()
export class ThumbnailQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<{ attachmentId: string; fileId: string }>;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ThumbnailQueue.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(THUMBNAIL_QUEUE, {
      connection: this.connection,
      prefix: THUMBNAIL_QUEUE_PREFIX,
    });
  }

  /** jobId = thumb-<attachmentId> — идемпотентность (повторная постановка,
   *  включая backfill, не плодит дубли). БЕЗ двоеточий: BullMQ запрещает ':'
   *  и в имени очереди, и в custom id (молчаливый catch прятал это — превью
   *  тихо не становились в очередь, репро прод-деплоя #150). */
  async enqueue(attachmentId: string, fileId: string): Promise<void> {
    try {
      await this.queue.add(
        'generate',
        { attachmentId, fileId },
        {
          jobId: `thumb-${attachmentId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // Превью — улучшение, не контракт: загрузка живёт без него. Но НЕ молча
      // (по молчаливому catch баг jobId ':' жил незамеченным): warn в лог.
      this.logger.warn(
        { attachmentId, err: error },
        'Постановка превью в очередь не удалась (не критично)',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
