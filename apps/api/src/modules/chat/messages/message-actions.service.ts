import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CHAT_EVENTS,
  type ForwardMessagesBody,
  type MessagePin,
  type MessageReactionToggleBody,
  type UserRef,
} from '@nodus/contracts';

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
import { can, parsePermissions } from '../permissions.js';
import { MessageDtoMapper } from './message-dto.mapper.js';
import { MessagePinsRepository, type PinRecord } from './message-pins.repository.js';
import { MessagesRepository, type MessageRow } from './messages.repository.js';
import { ThreadParticipantsRepository } from './thread-participants.repository.js';

/**
 * Действия над сообщениями: закрепы (лента закрепов), реакции (toggle),
 * пересылка (серверные копии одним запросом — комментарий ПЕРЕД блоком).
 */
@Injectable()
export class MessageActionsService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly pins: MessagePinsRepository,
    private readonly conversations: ConversationsRepository,
    private readonly mapper: MessageDtoMapper,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
    private readonly threadParticipants: ThreadParticipantsRepository,
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
        ? await this.messages.removeReaction(messageId, userId, body.emoji, tx)
        : await this.messages.addReaction(messageId, userId, body.emoji, tx);
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

  // ===== Пересылка =====

  /**
   * Пересылка одним запросом (одна транзакция): комментарий первым, затем
   * копии в порядке messageIds; seq и createdAt монотонны в блоке (мок:
   * now+i мс — сохраняем, иначе идентичные метки ломают сортировку ленты).
   * Копии: новый id, author=пересылающий, forwardedFrom=оригинальный автор,
   * текст копируется, вложения — по ссылке (file_id), реакции/цитата — нет.
   */
  async forward(
    userId: string,
    targetConversationId: string,
    body: ForwardMessagesBody,
    idempotencyKey: string | undefined,
  ): Promise<{ rows: MessageRow[]; members: MemberRow[] }> {
    const baseKey = idempotencyKey ?? randomUUID();
    return this.txRunner.run(async (tx) => {
      const membership = await this.conversations.findMembership(targetConversationId, userId, tx);
      if (!membership) throw DomainException.notFound('Conversation not found');
      // Членство в исходной беседе обязательно: иначе пересылка читает чужое.
      if (!(await this.conversations.findMembership(body.sourceConversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const conversation = await this.conversations.findTypeAndPermissions(
        targetConversationId,
        tx,
      );
      if (!conversation) throw DomainException.notFound('Conversation not found');
      const permissions = parsePermissions(conversation.permissions);
      const threadRootId = body.threadRootId ?? null;

      if (threadRootId === null) {
        if (!can(membership.role as 'owner' | 'admin' | 'member', permissions, 'post')) {
          throw DomainException.forbidden('Posting in this conversation requires permission');
        }
      } else {
        // Цель в треде: корень обязан быть этой беседы и корнем (мок forward).
        const root = await this.messages.findByIdInConversation(
          targetConversationId,
          threadRootId,
          tx,
        );
        if (!root || root.threadRootId !== null) {
          throw DomainException.notFound('Thread root not found');
        }
      }

      const sources = await this.messages.findForwardSources(
        body.sourceConversationId,
        body.messageIds,
        tx,
      );
      type Draft = {
        text: string;
        fwd: {
          conversationId: string;
          messageId: string;
          authorId: string;
          threadRootId: string | null;
        } | null;
        sourceId: string | null;
      };
      const drafts: Draft[] = [];
      if (body.comment !== undefined) {
        drafts.push({ text: body.comment, fwd: null, sourceId: null });
      }
      for (const source of sources) {
        drafts.push({
          text: source.text,
          fwd: {
            conversationId: source.conversationId,
            messageId: source.id,
            authorId: source.authorId,
            threadRootId: source.threadRootId,
          },
          sourceId: source.id,
        });
      }
      if (drafts.length === 0) throw DomainException.notFound('No messages to forward');

      // Тред: фиксируем «было ли до нас» до вставок (лок беседы уже сериализовал).
      let priorThreadReplies = -1;
      if (threadRootId !== null) {
        priorThreadReplies = await this.messages.countAllThreadReplies(threadRootId, tx);
      }

      const firstSeq = await this.messages.allocateSeqs(targetConversationId, drafts.length, tx);
      const createdAt = Date.now();
      const created: MessageRow[] = [];
      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i]!;
        const row = await this.messages.insertMessage(
          {
            id: randomUUID(),
            conversationId: targetConversationId,
            seq: firstSeq + BigInt(i),
            authorId: userId,
            // Суффикс: все копии одного запроса делят ключ, уникальность пары.
            clientMessageId: draft.sourceId === null ? `${baseKey}:c` : `${baseKey}:${i}`,
            text: draft.text,
            replyToId: null,
            replySnapshot: null,
            threadRootId,
            fwd: draft.fwd,
            createdAt: new Date(createdAt + i),
          },
          tx,
        );
        if (!row) throw new Error('forward: unexpected idempotency conflict on copy insert');
        if (draft.sourceId) {
          await this.messages.copyAttachments(draft.sourceId, row.id, tx);
        }
        created.push(row);
      }

      if (threadRootId !== null) {
        const root = await this.messages.findByIdInConversation(
          targetConversationId,
          threadRootId,
          tx,
        );
        if (root) {
          await this.threadParticipants.upsert(threadRootId, root.authorId, 'author', tx);
        }
        await this.threadParticipants.upsert(threadRootId, userId, 'replier', tx);
        if (priorThreadReplies === 0) {
          await this.eventBus.emit(
            tx,
            CHAT_EVENTS.THREAD_CREATED,
            { conversationId: targetConversationId, threadRootId, messageId: created[0]!.id },
            { actorId: userId, aggregateType: 'conversation', aggregateId: targetConversationId },
          );
        }
      } else {
        await this.messages.touchLastMessageAt(targetConversationId, tx);
      }
      await this.conversations.unsnooze(targetConversationId, userId, tx);
      // Пересылка — активность: раскрывает беседу скрывшим её участникам (#103).
      await this.conversations.revealHidden(targetConversationId, tx);

      const members = await this.conversations.listMembers([targetConversationId], tx);
      // Вложения копий одним батчем (для payload DTO, раунд 3).
      const copyAttachments = await this.messages.attachmentsFor(
        created.map((row) => row.id),
        tx,
      );
      const attachmentsByMessage = new Map<string, typeof copyAttachments>();
      for (const attachment of copyAttachments) {
        const list = attachmentsByMessage.get(attachment.messageId) ?? [];
        list.push(attachment);
        attachmentsByMessage.set(attachment.messageId, list);
      }
      for (const row of created) {
        // Полный DTO в payload (раунд 3): клиенты применяют локально по seq.
        // Профили — по соединению транзакции (tx): чтение мимо tx-клиента
        // занимает второе соединение пула и под бурстом взаимоблокирует
        // отправителей (repro-класс chat-reliability, замечание валидатора).
        const payloadMessage = await this.mapper.toFreshDto(row, {
          viewerId: userId,
          members,
          replyOriginal: null,
          attachments: attachmentsByMessage.get(row.id) ?? [],
          tx,
        });
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_SENT,
          {
            conversationId: targetConversationId,
            messageId: row.id,
            seq: Number(row.seq),
            authorId: userId,
            threadRootId,
            forwarded: row.clientMessageId !== `${baseKey}:c`,
            message: payloadMessage,
          },
          { actorId: userId, aggregateType: 'conversation', aggregateId: targetConversationId },
        );
      }
      return { rows: created, members };
    });
  }
}
