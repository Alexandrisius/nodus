import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { NotificationsRepository } from '../notifications.repository.js';
import { UrgentRepeatQueue } from '../urgent-repeat.queue.js';

interface DispatchPayload {
  snapshot: {
    notificationId: string;
    userId: string;
    priority: string;
    kind: string;
    sourceId: string;
    conversationId: string | null;
    conversationTitle: string | null;
    messageId: string | null;
    threadRootId: string | null;
    preview: string | null;
  };
  attempt: number;
  seq: number;
}

/**
 * Подписчик `notification.dispatch_requested` — единая точка входа диспетчера
 * каналов (каталог событий): фиксирует доставку в журнале (channel='ws' при
 * первой, 'repeat' при повторе — C11/D6) и для срочного планирует BullMQ-
 * повторы. Само WS-будило — конвейер outbox → RedisStreamPublisher → gateway
 * (это событие расходится как любое доменное; хендлер только журналирует).
 * Идемпотентность: повторная доставка события пишет дубль записи deliveries?
 * — нет: запись доставки не влияет на клиентский эффект (gateway дубли
 * безвредны), дубль строки допустим для at-least-once-журнала.
 */
@Injectable()
export class DispatchHandler implements DomainEventHandler<DispatchPayload> {
  static readonly eventType = 'notification.dispatch_requested';

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly repeats: UrgentRepeatQueue,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<DispatchPayload>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const { snapshot, attempt } = event.payload;
    if (!snapshot?.notificationId) return;

    await this.txRunner.run(async (tx) => {
      await this.repo.recordDelivery(
        snapshot.notificationId,
        attempt === 0 ? 'ws' : 'repeat',
        attempt,
        tx,
      );
      if (snapshot.priority === 'urgent' && attempt === 0) {
        await this.repeats.enqueue(snapshot.notificationId);
      }
    });
  }
}
