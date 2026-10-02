import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { EventBus } from '../../core/events/event-bus.js';
import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { NotificationsRepository } from './notifications.repository.js';
import {
  UrgentRepeatQueue,
  URGENT_QUEUE_PREFIX,
  URGENT_REPEAT_QUEUE,
  urgentMaxSec,
  urgentRepeatSec,
} from './urgent-repeat.queue.js';

/**
 * In-process BullMQ-воркер повторов срочного (#100; монолит I1, паттерн
 * ThumbnailWorker): каждые NOTIFY_URGENT_REPEAT_SEC — стоп-условия из БД
 * (ознакомлен/прочитал/ответил/отреагировал → repeats_stopped_at), живое —
 * эмит dispatch_requested attempt=N+1 (тост повторного напоминания, C2) и
 * перепланирование; потолок NOTIFY_URGENT_MAX_SEC — стоп с оставлением
 * строки непрочитанной (C4).
 */
@Injectable()
export class UrgentRepeatWorker implements OnModuleInit, OnModuleDestroy {
  private connection: Redis | null = null;
  private worker?: Worker<{ notificationId: string }>;

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly repeats: UrgentRepeatQueue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UrgentRepeatWorker.name);
  }

  /** Соединение/воркер — на старте модуля (unit-тесты зовут только remind). */
  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.worker = new Worker<{ notificationId: string }>(
      URGENT_REPEAT_QUEUE,
      async (job) => {
        await this.remind(job.data.notificationId);
      },
      { connection: this.connection, concurrency: 4, prefix: URGENT_QUEUE_PREFIX },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        { notificationId: job?.data.notificationId, err: error },
        'Повтор срочного не удался',
      );
    });
  }

  /** Один такт повтора — public для интеграционных тестов. */
  async remind(notificationId: string): Promise<'stop' | 'sent' | 'expired'> {
    const row = await this.repo.findRaw(notificationId);
    if (!row || row.priority !== 'urgent') return 'stop';
    if (row.ack_at || row.repeats_stopped_at || row.read_at) return 'stop';

    const elapsedSec = (Date.now() - row.created_at.getTime()) / 1000;
    if (elapsedSec >= urgentMaxSec()) {
      await this.repo.markRepeatsStopped(notificationId); // потолок (C4)
      return 'expired';
    }

    const nextAttempt = Math.max(1, Math.floor(elapsedSec / urgentRepeatSec()));
    await this.txRunner.run(async (tx) => {
      await this.eventBus.emit(
        tx,
        NOTIFICATION_EVENTS.DISPATCH_REQUESTED,
        {
          snapshot: {
            notificationId: row.id,
            userId: row.user_id,
            priority: row.priority,
            kind: row.kind,
            sourceId: row.source_id,
            conversationId: row.conversation_id,
            conversationTitle: row.conversation_title,
            messageId: row.message_id,
            threadRootId: row.thread_root_id,
            preview: row.preview,
            actorName: null,
          },
          attempt: nextAttempt,
          seq: Number(row.seq),
        },
        { actorId: null, aggregateType: 'notification', aggregateId: row.id },
      );
    });
    await this.repeats.reenqueue(notificationId, nextAttempt);
    return 'sent';
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
