import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { previewJobId } from './url-normalize.js';

/** Имя без двоеточий (BullMQ запрещает ':' — урок #150), префикс nodus. */
export const LINK_PREVIEW_QUEUE = 'chat-link-preview';
export const LINK_PREVIEW_QUEUE_PREFIX = 'nodus';

export interface LinkPreviewJob {
  conversationId: string;
  messageId: string;
  rawUrl: string;
  normalizedUrl: string;
  authorId: string;
}

/**
 * Продюсер очереди превью ссылок (#212, ADR-0018): jobId = нормализованный
 * URL — повторные отправки того же адреса дедупятся BullMQ (готовое в кэше
 * и вовсе не ставится). Best-effort: недоступный Redis не валит отправку
 * сообщения (превью опционально, лента живёт текстом).
 */
@Injectable()
export class LinkPreviewQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<LinkPreviewJob>;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LinkPreviewQueue.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(LINK_PREVIEW_QUEUE, {
      connection: this.connection,
      prefix: LINK_PREVIEW_QUEUE_PREFIX,
    });
  }

  async enqueue(job: LinkPreviewJob): Promise<void> {
    try {
      await this.queue.add('fetch', job, {
        jobId: previewJobId(job.normalizedUrl),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Завершённые НЕ ретеншнятся (code-ревью): стабильный jobId +
        // ретеншен дедупили бы повторную постановку навсегда — expired кэш
        // не смог бы перегреться. Дедуп — только in-flight задачи.
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (error) {
      this.logger.warn(
        { normalizedUrl: job.normalizedUrl, error },
        'Превью: постановка не удалась',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
