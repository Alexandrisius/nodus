import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ListNotificationsQuery,
  Notification,
  NotificationDelivery,
  NotificationPage,
  NotificationSettings,
  NotificationSummary,
  UrgentAckStatus,
} from '@nodus/contracts';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';
import { ErrorCode } from '@nodus/contracts';
import { EventBus } from '../../core/events/event-bus.js';
import {
  TransactionRunner,
  type TransactionClient,
} from '../../core/database/transaction-runner.js';
import { USER_PROFILE_READER, type UserProfileReader } from '../../core/ports/user-profile.port.js';
import {
  CHAT_MEMBERSHIP_READER,
  type ChatConversationState,
  type ChatMembershipReader,
} from '../chat/membership-reader.port.js';
import {
  NotificationsRepository,
  PREVIEW_MAX,
  type NotificationInsert,
} from './notifications.repository.js';
import { resolveMessageNotifications } from './tier-resolver.js';

const CURSOR_PATTERN = /^[0-9]+$/;

/** Настройки по умолчанию (DND выключен; окно сохраняется на будущее). */
const DEFAULT_SETTINGS: NotificationSettings = {
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '08:00',
};

/**
 * Бизнес-логика журнала уведомлений (ADR-0016): лента/сводка, ознакомление,
 * «ознакомились N из M», настройки, гашение по источнику. Создание строк —
 * events/message-sent.handler (конвейер событий); HTTP сервис не знает.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
    @Inject(CHAT_MEMBERSHIP_READER) private readonly chatMembership: ChatMembershipReader,
  ) {}

  async list(userId: string, query: ListNotificationsQuery): Promise<NotificationPage> {
    if (query.cursor !== undefined && !CURSOR_PATTERN.test(query.cursor)) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Invalid cursor');
    }
    const { rows, hasMore } = await this.repo.list(userId, query);
    const items = await this.repo.toDtos(rows);
    return {
      items,
      nextCursor: hasMore && rows.length > 0 ? String(rows[rows.length - 1]!.seq) : null,
      lastSeq: rows.length > 0 ? Number(rows[0]!.seq) : 0,
    };
  }

  async summary(userId: string): Promise<NotificationSummary> {
    const counts = await this.repo.summary(userId);
    return { ...counts, attention: counts.urgent + counts.personal + counts.action };
  }

  /** Прочитать одно обычное (E3 — осознанное гашение из карточки);
   *  срочное
   *  читается только ознакомлением. */
  async readOne(userId: string, id: string): Promise<Notification> {
    const row = await this.repo.readOne(userId, id);
    if (!row) throw DomainException.notFound('Notification not found');
    if (row.tier === 'urgent' && row.read_at === null) {
      throw DomainException.conflict('Urgent notification is read by acknowledgement only');
    }
    const [dto] = await this.repo.toDtos([row]);
    return dto!;
  }

  /** Ознакомление (СЭД-паттерн): своё срочное; будило отправителю (C8/C9). */
  async ack(userId: string, id: string): Promise<Notification> {
    const row = await this.repo.ack(userId, id);
    if (!row) throw DomainException.notFound('Notification not found');
    if (row.ack_at && row.message_id) {
      const { rows, expected } = await this.repo.urgentAcks(row.message_id);
      const authorId = await this.repo.urgentAuthorId(row.message_id);
      if (authorId && authorId !== userId) {
        await this.txRunner.run(async (tx) => {
          await this.eventBus.emit(
            tx,
            NOTIFICATION_EVENTS.ACKED,
            {
              userId: authorId,
              messageId: row.message_id,
              ackedCount: rows.length,
              expectedCount: expected,
              ackedAt: row.ack_at!.toISOString(),
            },
            { actorId: userId, aggregateType: 'notification', aggregateId: row.message_id! },
          );
        });
      }
    }
    const [dto] = await this.repo.toDtos([row]);
    return dto!;
  }

  /** Статус «Ознакомились N из M» для отправителя срочного (C8/C9). */
  async urgentAcks(messageId: string): Promise<UrgentAckStatus> {
    const { rows, expected } = await this.repo.urgentAcks(messageId);
    const refs = await this.userProfiles.findRefs(rows.map((r) => r.userId));
    const byId = new Map(refs.map((r) => [r.id, r]));
    return {
      messageId,
      ackedCount: rows.length,
      expectedCount: expected,
      items: rows.map((r) => ({
        user: byId.get(r.userId) ?? { id: r.userId, displayName: '—', avatarUrl: null },
        ackedAt: r.ackedAt.toISOString(),
      })),
    };
  }

  /** Журнал доставок (D6: когда и каким каналом уведомили). */
  async deliveries(userId: string, id: string): Promise<NotificationDelivery[]> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw DomainException.notFound('Notification not found');
    return this.repo.deliveries(id);
  }

  async settings(userId: string): Promise<NotificationSettings> {
    return (await this.repo.readSettings(userId)) ?? DEFAULT_SETTINGS;
  }

  async updateSettings(
    userId: string,
    patch: Partial<NotificationSettings>,
  ): Promise<NotificationSettings> {
    return this.repo.upsertSettings(userId, patch);
  }

  /** Гашение по источнику (обработчик chat.message_read): журнал + будило. */
  async markReadBySource(userId: string, sourceId: string, upToSeq: number): Promise<number> {
    return this.txRunner.run(async (tx) => {
      const read = await this.repo.markReadBySource(userId, sourceId, upToSeq, tx);
      await this.repo.stopRepeats(userId, { conversationId: sourceId }, tx);
      if (read > 0) {
        await this.emitRead(tx, userId, sourceId, null);
      }
      return read;
    });
  }

  /** Стоп повторов по реакции получателя (C3, обработчик chat.reaction_added). */
  async stopRepeatsByReaction(userId: string, messageId: string): Promise<void> {
    await this.repo.stopRepeats(userId, { messageId });
  }

  private async emitRead(
    tx: TransactionClient,
    userId: string,
    sourceId: string | null,
    notificationIds: string[] | null,
  ): Promise<void> {
    await this.eventBus.emit(
      tx,
      NOTIFICATION_EVENTS.READ,
      { userId, sourceId, notificationIds, readAt: new Date().toISOString() },
      { actorId: userId, aggregateType: 'notification', aggregateId: userId },
    );
  }

  /** Сборка строк журнала из события message_sent (вызывает хендлер). */
  buildInsertsFromMessageEvent(
    event: {
      id: string;
      payload: {
        conversationId: string;
        messageId: string;
        seq: number;
        authorId: string;
        threadRootId: string | null;
        urgent: boolean;
        mentionedUserIds: string[];
        message?: { text?: string } | null;
      };
    },
    state: ChatConversationState,
    threadWatcherIds: string[],
  ): NotificationInsert[] {
    const resolved = resolveMessageNotifications({
      conversationType: state.type,
      authorId: event.payload.authorId,
      urgent: event.payload.urgent,
      mentionedUserIds: event.payload.mentionedUserIds,
      threadWatcherIds: event.payload.threadRootId !== null ? threadWatcherIds : [],
      members: state.members,
    });
    const text = event.payload.message?.text ?? '';
    return resolved.map((r) => ({
      id: randomUUID(),
      user_id: r.userId,
      tier: r.tier,
      kind: r.kind,
      source_type: 'conversation',
      source_id: event.payload.conversationId,
      source_seq: BigInt(event.payload.seq),
      actor_id: event.payload.authorId,
      preview: text.length > 0 ? text.slice(0, PREVIEW_MAX) : null,
      urgent_text: r.tier === 'urgent' ? text : null,
      conversation_id: event.payload.conversationId,
      conversation_title: state.title,
      message_id: event.payload.messageId,
      thread_root_id: event.payload.threadRootId,
      event_id: event.id,
    }));
  }

  /** Обёртки порта чата для хендлеров (мокируются в тестах). */
  async conversationState(conversationId: string) {
    return this.chatMembership.conversationState(conversationId);
  }

  async threadWatcherIds(threadRootId: string) {
    return this.chatMembership.threadWatcherIds(threadRootId);
  }
}
