import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { PinoLogger } from 'nestjs-pino';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationsService } from '../notifications.service.js';

interface MessageSentPayload {
  conversationId: string;
  messageId: string;
  seq: number;
  authorId: string;
  threadRootId: string | null;
  urgent: boolean;
  mentionedUserIds?: string[];
  message?: { text?: string; author?: { displayName?: string } } | null;
}

/**
 * Подписчик `chat.message_sent` (#100, ADR-0016): резолвит ярусы адресатов
 * (таблица решений), пишет журнал и эмитит `notification.dispatch_requested`
 * в одной транзакции — WS-фанут расходится штатным конвейером (I3: чат не
 * знает про уведомления, связность — событие). Идемпотентность: дедуп
 * (event_id, user_id) в БД — повторная доставка события (outbox redelivery)
 * создаёт 0 строк и не эмитит (D4). Ответ автора сообщения останавливает
 * его срочные повторы в беседе (C3: ответ = стоп).
 */
@Injectable()
export class MessageSentHandler implements DomainEventHandler<MessageSentPayload> {
  static readonly eventType = 'chat.message_sent';

  constructor(
    private readonly service: NotificationsService,
    private readonly repo: NotificationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly featureFlags: FeatureFlagService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MessageSentHandler.name);
  }

  async handle(event: DomainEvent<MessageSentPayload>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const payload = event.payload;
    if (!payload?.conversationId || !payload?.messageId) return;

    // Ответ автора = стоп его срочных повторов в этой беседе (C3).
    await this.repo.stopRepeats(payload.authorId, { conversationId: payload.conversationId });

    const state = await this.service.conversationState(payload.conversationId);
    if (!state) return; // беседа исчезла — журналимое событие потеряло источник
    const watchers =
      payload.threadRootId !== null
        ? await this.service.threadWatcherIds(payload.threadRootId)
        : [];
    const inserts = this.service.buildInsertsFromMessageEvent(
      {
        id: event.id,
        payload: {
          ...payload,
          mentionedUserIds: payload.mentionedUserIds ?? [],
          urgent: payload.urgent ?? false,
        },
      },
      state,
      watchers,
    );
    if (inserts.length === 0) return;

    await this.txRunner.run(async (tx) => {
      const created = await this.repo.createFromEvent(inserts, tx);
      for (const row of created) {
        await this.eventBus.emit(
          tx,
          NOTIFICATION_EVENTS.DISPATCH_REQUESTED,
          {
            snapshot: {
              notificationId: row.id,
              userId: row.user_id,
              tier: row.tier,
              kind: row.kind,
              sourceId: row.source_id,
              conversationId: row.conversation_id,
              conversationTitle: row.conversation_title,
              messageId: row.message_id,
              threadRootId: row.thread_root_id,
              preview: row.preview,
              actorName: payload.message?.author?.displayName ?? null,
            },
            attempt: 0,
            seq: Number(row.seq),
          },
          { actorId: payload.authorId, aggregateType: 'notification', aggregateId: row.id },
        );
      }
      if (created.length === 0) {
        this.logger.debug({ eventId: event.id }, 'message_sent: all duplicates skipped');
      }
    });
  }
}
