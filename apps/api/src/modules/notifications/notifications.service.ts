import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ListNotificationsQuery,
  Notification,
  NotificationDelivery,
  NotificationPage,
  NotificationSettings,
  NotificationSummary,
} from '@nodus/contracts';
import { NOTIFICATION_EVENTS, stripMentionTokens } from '@nodus/contracts';

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
import { resolveMessageNotifications, KIND_PRIORITY } from './priority-resolver.js';

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
    return { ...counts, attention: counts.urgent + counts.high + counts.medium };
  }

  /** Прочитать одно (E3 — осознанное гашение из карточки): любое, включая
   *  важное — ack-механики нет (ревизия модели 05.10), повторы гасит
   *  прочтение (repo.readOne + markReadBySource). Реальный переход в read
   *  эмитит notification.read — другие устройства владельца синхронят бейдж
   *  (D2); повторное чтение прочитанного — тишина (#267). */
  async readOne(userId: string, id: string): Promise<Notification> {
    const row = await this.txRunner.run(async (tx) => {
      const read = await this.repo.readOne(userId, id, tx);
      if (!read) return null;
      if (read.changed) {
        await this.emitRead(tx, userId, read.row.source_id, [read.row.id]);
      }
      return read.row;
    });
    if (!row) throw DomainException.notFound('Notification not found');
    const [dto] = await this.repo.toDtos([row]);
    return dto!;
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

  /** Чистка по удалённому сообщению (#267, обработчик chat.message_deleted):
   *  удалённое до прочтения сообщение физически не прочитывается
   *  (obliterated-строки нет во вьюпорте — watermark не накроет source_seq),
   *  строки журнала об этом сообщении удаляются у всех получателей; каждому
   *  затронутому — notification.read (бейдж/лента — штатный конвейер, как при
   *  гашении прочтением). Идемпотентно: 0 строк — 0 эмитов. */
  async purgeByMessage(conversationId: string, messageId: string): Promise<number> {
    return this.txRunner.run(async (tx) => {
      // Дедуп: у одного пользователя может быть несколько строк на сообщение
      // (sent + edited) — notification.read достаточно один на пользователя.
      const affected = [...new Set(await this.repo.deleteByMessage(messageId, tx))];
      for (const userId of affected) {
        await this.emitRead(tx, userId, conversationId, null);
      }
      return affected.length;
    });
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
    // Превью центра — БЕЗ токенов упоминаний (#224): стрип ДО обрезки —
    // slice по сырому тексту разрезал бы `@[Имя](user:…)` посередине и центр
    // показывал сырую разметку.
    const text = stripMentionTokens(event.payload.message?.text ?? '');
    return resolved.map((r) => ({
      id: randomUUID(),
      user_id: r.userId,
      priority: r.priority,
      kind: r.kind,
      source_type: 'conversation',
      source_id: event.payload.conversationId,
      source_seq: BigInt(event.payload.seq),
      actor_id: event.payload.authorId,
      preview: text.length > 0 ? text.slice(0, PREVIEW_MAX) : null,
      urgent_text: r.priority === 'urgent' ? text : null,
      conversation_id: event.payload.conversationId,
      conversation_title: state.title,
      message_id: event.payload.messageId,
      thread_root_id: event.payload.threadRootId,
      event_id: event.id,
    }));
  }

  /** Сборка строк журнала из события message_edited (#189: правка прилетает
   *  в центр): всем членам беседы кроме редактора, низкий приоритет — счётчик
   *  в чате меняется, центр показывает то же. Высокий chat.mention — только
   *  ПЕРВЫЙ личный тэг (#239 + вердикт 10.10: замена @Все на прямой тэг —
   *  высший): человек упомянут в новой версии, никогда не тэгался лично
   *  (previousMentionedUserIds — личные тэги за историю) и (тэг личный,
   *  либо broadcast-«Все» добавлен этой правкой впервые). Повторные тэги
   *  и убрали-вернули того же — не дёргаем. */
  buildInsertsFromEditedEvent(
    event: {
      id: string;
      payload: {
        conversationId: string;
        messageId: string;
        authorId: string;
        text: string;
        seq: number;
        mentionedUserIds?: string[];
        previousMentionedUserIds?: string[];
        previousMentionedAll?: boolean;
        directMentionedUserIds?: string[];
      };
    },
    state: ChatConversationState,
  ): NotificationInsert[] {
    const text = stripMentionTokens(event.payload.text ?? '');
    const mentioned = new Set(event.payload.mentionedUserIds ?? []);
    // Личные тэги за историю сообщения; broadcast-«Все» в истории отдельно.
    const everDirect = new Set(event.payload.previousMentionedUserIds ?? []);
    const hadAllBefore = event.payload.previousMentionedAll === true;
    const directNew = new Set(event.payload.directMentionedUserIds ?? []);
    return state.members
      .filter((m) => m.userId !== event.payload.authorId)
      .map((m) => {
        // Первый личный тэг — high (broadcast в истории его НЕ глушит,
        // вердикт владельца 10.10: «@Все → @Анна — Анне высший»); или
        // первый broadcast («Все» добавлен правкой, человека не тэгали).
        const newly =
          mentioned.has(m.userId) &&
          !everDirect.has(m.userId) &&
          (directNew.has(m.userId) || !hadAllBefore);
        const kind = newly ? 'chat.mention' : 'chat.message_edited';
        return {
          id: randomUUID(),
          user_id: m.userId,
          priority: KIND_PRIORITY[kind],
          kind,
          source_type: 'conversation',
          source_id: event.payload.conversationId,
          source_seq: BigInt(event.payload.seq),
          actor_id: event.payload.authorId,
          preview: text.length > 0 ? text.slice(0, PREVIEW_MAX) : null,
          urgent_text: null,
          conversation_id: event.payload.conversationId,
          conversation_title: state.title,
          message_id: event.payload.messageId,
          thread_root_id: null,
          event_id: event.id,
        };
      });
  }

  /** Обёртки порта чата для хендлеров (мокируются в тестах). */
  async conversationState(conversationId: string) {
    return this.chatMembership.conversationState(conversationId);
  }

  async threadWatcherIds(threadRootId: string) {
    return this.chatMembership.threadWatcherIds(threadRootId);
  }

  /** Имя актора для снапшота будила (правка: события без DTO автора). */
  async actorName(userId: string): Promise<string | null> {
    const [ref] = await this.userProfiles.findRefs([userId]);
    return ref?.displayName ?? null;
  }
}
