import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/** Имя очереди превью (конвенция ключей `nodus:<module>:*`). */
export const THUMBNAIL_QUEUE = 'nodus:chat:thumbnail';

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

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(THUMBNAIL_QUEUE, { connection: this.connection });
  }

  /** jobId = thumb:<attachmentId> — идемпотентность (повторная постановка,
   *  включая backfill, не плодит дубли). */
  async enqueue(attachmentId: string, fileId: string): Promise<void> {
    try {
      await this.queue.add(
        'generate',
        { attachmentId, fileId },
        {
          jobId: `thumb:${attachmentId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch {
      // Превью — улучшение, не контракт: молча живём без него (логирует
      // вызывающий контекст при желании; повторная загрузка не требуется).
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
