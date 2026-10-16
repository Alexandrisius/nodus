import { Injectable } from '@nestjs/common';
import { CHAT_EVENTS, type MessageReactionToggleBody } from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import {
  ConversationsRepository,
  type MemberRow,
} from '../conversations/conversations.repository.js';
import type { MessageRow } from './message-row.js';
import { MessagesRepository } from './messages.repository.js';
import { MessagesReactionsRepository } from './messages-reactions.repository.js';

/**
 * Реакции сообщений: toggle своей реакции. Выделено из MessageActionsService
 * (I5: один файл = одна ответственность).
 */
@Injectable()
export class MessageReactionsService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly reactionsRepo: MessagesReactionsRepository,
    private readonly conversations: ConversationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  // ===== Реакции =====

  /** Toggle своей реакции (контракт messageReactionToggleBodySchema). */
  async toggleReaction(
    userId: string,
    conversationId: string,
    messageId: string,
    body: MessageReactionToggleBody,
  ): Promise<{ message: MessageRow; members: MemberRow[] }> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const message = await this.messages.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      const changed = body.remove
        ? await this.reactionsRepo.removeReaction(messageId, userId, body.emoji, tx)
        : await this.reactionsRepo.addReaction(messageId, userId, body.emoji, tx);
      if (changed) {
        await this.eventBus.emit(
          tx,
          body.remove ? CHAT_EVENTS.REACTION_REMOVED : CHAT_EVENTS.REACTION_ADDED,
          { conversationId, messageId, emoji: body.emoji, userId },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
      const fresh =
        (await this.messages.findByIdInConversation(conversationId, messageId, tx)) ?? message;
      return {
        message: fresh,
        members: await this.conversations.listMembers([conversationId], tx),
      };
    });
  }
}
