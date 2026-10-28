import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  NOTIFICATION_EVENTS,
  Permission,
  type DomainEvent,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import {
  ROLE_MEMBERSHIP_READER,
  type RoleMembershipReader,
} from '../../../core/ports/role-membership.port.js';
import { KIND_PRIORITY } from '../priority-resolver.js';
import { NotificationsRepository } from '../notifications.repository.js';

/**
 * Уведомления канцелярии о почте (#56, Р8): «Поступило письмо» — на КАЖДОЕ
 * почтовое письмо (В4: «по каждому новому письму Вике было уведомление…
 * не хуже аутлука»), «Почта не принимается» — аккумулятор порога, «Исходящее
 * не отправлено» — финальный провал SMTP. Получатели — держатели
 * `correspondence.register`; конвейер — канон task-events.handler: журнал +
 * dispatch_requested одной транзакцией, дедуп по (event_id, user_id).
 */
@Injectable()
class MailNotificationWriter {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly featureFlags: FeatureFlagService,
    @Inject(ROLE_MEMBERSHIP_READER) private readonly membership: RoleMembershipReader,
  ) {}

  async write(
    event: DomainEvent<Record<string, unknown>>,
    notice: {
      kind: 'letter.arrived' | 'mail.sync_failed' | 'letter.send_failed';
      preview: string;
      sourceType: 'letter' | 'mail';
      sourceId: string;
    },
  ): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const holders = await this.membership.holdersOf(Permission.CORRESPONDENCE_REGISTER);
    if (holders.length === 0) return;
    await this.txRunner.run(async (tx) => {
      const created = await this.repo.createFromEvent(
        holders.map((holder) => ({
          id: randomUUID(),
          user_id: holder.id,
          priority: KIND_PRIORITY[notice.kind],
          kind: notice.kind,
          source_type: notice.sourceType,
          source_id: notice.sourceId,
          source_seq: 0n,
          actor_id: event.actorId,
          preview: notice.preview,
          urgent_text: null,
          conversation_id: null,
          conversation_title: null,
          message_id: null,
          thread_root_id: null,
          event_id: event.id,
        })),
        tx,
      );
      for (const row of created) {
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
              sourceType: notice.sourceType,
              conversationId: null,
              conversationTitle: null,
              messageId: null,
              threadRootId: null,
              preview: row.preview,
              actorName: null,
            },
            attempt: 0,
            seq: Number(row.seq),
          },
          { actorId: event.actorId, aggregateType: 'notification', aggregateId: row.id },
        );
      }
    });
  }
}

export { MailNotificationWriter };

@Injectable()
export class LetterArrivedNotifyHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_RECEIVED;
  constructor(private readonly writer: MailNotificationWriter) {}
  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    // Только почта (В4): ручное создание канцелярия и так видит своими руками.
    if (event.payload.source !== 'mail') return;
    const subject = event.payload.letterSubject;
    await this.writer.write(event, {
      kind: 'letter.arrived',
      preview: typeof subject === 'string' && subject ? subject : 'Письмо без темы',
      sourceType: 'letter',
      sourceId: String(event.payload.letterId),
    });
  }
}

@Injectable()
export class MailSyncFailedNotifyHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.MAIL_SYNC_FAILED;
  constructor(private readonly writer: MailNotificationWriter) {}
  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const sourceId = event.payload.sourceId;
    const error = event.payload.error;
    if (typeof sourceId !== 'string' || typeof error !== 'string') return;
    await this.writer.write(event, {
      kind: 'mail.sync_failed',
      preview: error,
      sourceType: 'mail',
      sourceId,
    });
  }
}

@Injectable()
export class LetterSendFailedNotifyHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_SEND_FAILED;
  constructor(private readonly writer: MailNotificationWriter) {}
  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    // Отправка вне карточки письма (#464) — источника для клика нет.
    const letterId = event.payload.letterId;
    if (typeof letterId !== 'string') return;
    const error = event.payload.error;
    await this.writer.write(event, {
      kind: 'letter.send_failed',
      preview: typeof error === 'string' ? error : 'Ошибка отправки',
      sourceType: 'letter',
      sourceId: letterId,
    });
  }
}
