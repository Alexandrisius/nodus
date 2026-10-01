import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

/** Очередь повторов срочных: имя БЕЗ двоеточий (BullMQ, урок PR #157). */
export const URGENT_REPEAT_QUEUE = 'notification-repeat';
export const URGENT_QUEUE_PREFIX = 'nodus';

export function urgentRepeatSec(): number {
  return Number(process.env.NOTIFY_URGENT_REPEAT_SEC ?? 300);
}

export function urgentMaxSec(): number {
  return Number(process.env.NOTIFY_URGENT_MAX_SEC ?? 1800);
}

/**
 * Продюсер очереди повторов «срочного» (#100, ADR-0016 §5): BullMQ поверх
 * REDIS_URL, выделенное соединение (maxRetriesPerRequest=null — не делить с
 * блокирующими командами REDIS_CLIENT, паттерн ThumbnailQueue). Постановка
 * best-effort: недоступный Redis не валит доставку (повтор — усиление).
 */
@Injectable()
export class UrgentRepeatQueue implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<{ notificationId: string }>;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(UrgentRepeatQueue.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(URGENT_REPEAT_QUEUE, {
      connection: this.connection,
      prefix: URGENT_QUEUE_PREFIX,
    });
  }

  /** jobId без двоеточий (урок #150): повторная постановка — no-op. */
  async enqueue(notificationId: string): Promise<void> {
    try {
      await this.queue.add(
        'remind',
        { notificationId },
        {
          jobId: `urgt-${notificationId}`,
          delay: urgentRepeatSec() * 1000,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      this.logger.warn(
        { notificationId, err: error },
        'Постановка повтора срочного не удалась (не критично)',
      );
    }
  }

  /** Перепланирование следующего повтора (вызывает воркер). */
  async reenqueue(notificationId: string, nextAttempt: number): Promise<void> {
    try {
      await this.queue.add(
        'remind',
        { notificationId },
        {
          jobId: `urgt-${notificationId}-${nextAttempt}`,
          delay: urgentRepeatSec() * 1000,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      this.logger.warn(
        { notificationId, err: error },
        'Перепланирование повтора срочного не удалось (не критично)',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
