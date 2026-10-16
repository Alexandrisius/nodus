import { Inject, Injectable } from '@nestjs/common';
import { CHAT_EVENTS, type MessagePin, type UserRef } from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import {
  ConversationsRepository,
  type MemberRow,
} from '../conversations/conversations.repository.js';
import { MessageDtoMapper } from './message-dto.mapper.js';
import { MessagePinsRepository, type PinRecord } from './message-pins.repository.js';
import type { MessageRow } from './message-row.js';
import { MessagesRepository } from './messages.repository.js';

/**
 * Закрепы сообщений: лента закрепов, pin (идемпотентный) / unpin. Выделено
 * из MessageActionsService (I5: один файл = одна ответственность).
 */
@Injectable()
export class MessagePinsService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly pins: MessagePinsRepository,
    private readonly conversations: ConversationsRepository,
    private readonly mapper: MessageDtoMapper,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
  ) {}

  // ===== Закрепы =====

  /** Лента закрепов (снапшоты целых сообщений, свежие первыми). */
  async listPins(userId: string, conversationId: string): Promise<MessagePin[]> {
    if (!(await this.conversations.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    const records = await this.pins.listWithMessages(conversationId);
    const members = await this.conversations.listMembers([conversationId]);
    const dtos = await this.mapper.toDtos(
      records.map((r) => r.message),
      { viewerId: userId, members },
    );
    const byId = new Map(dtos.map((dto) => [dto.id, dto]));
    const pinnerIds = [...new Set(records.map((r) => r.pin.pinnedBy))];
    const pinnerRefs = new Map(
      (await this.userProfiles.findRefs(pinnerIds)).map((ref) => [ref.id, ref]),
    );
    return records.flatMap(({ pin }) => {
      const message = byId.get(pin.messageId);
      const pinnedBy = pinnerRefs.get(pin.pinnedBy);
      return message && pinnedBy
        ? [{ message, pinnedBy, pinnedAt: pin.pinnedAt.toISOString() }]
        : [];
    });
  }

  /** Закрепить (любое живое сообщение, даже чужое/ответ треда — мок); идемпотентно. */
  async pin(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{
    pin: PinRecord;
    message: MessageRow;
    members: MemberRow[];
    pinnedByRef: UserRef;
  }> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const message = await this.messages.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      const created = await this.pins.pin(conversationId, messageId, userId, tx);
      const pin = created
        ? { conversationId, messageId, pinnedBy: userId, pinnedAt: new Date() }
        : // tx — чтение по соединению транзакции (правило пула, раунд 3).
          ((await this.pins.findByMessage(messageId, tx)) ?? {
            conversationId,
            messageId,
            pinnedBy: userId,
            pinnedAt: new Date(),
          });
      if (created) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_PINNED,
          { conversationId, messageId, pinnedBy: userId },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
      const [pinnedByRef] = await this.userProfiles.findRefs([pin.pinnedBy], tx);
      return {
        pin,
        message,
        members: await this.conversations.listMembers([conversationId], tx),
        pinnedByRef: pinnedByRef ?? {
          id: pin.pinnedBy,
          displayName: 'Пользователь',
          avatarUrl: null,
        },
      };
    });
  }

  /** Открепить; откреп незакреплённого — 404 (мок). */
  async unpin(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      if (!(await this.pins.unpin(conversationId, messageId, tx))) {
        throw DomainException.notFound('Message not found');
      }
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_UNPINNED,
        { conversationId, messageId, unpinnedBy: userId },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
    });
  }
}
