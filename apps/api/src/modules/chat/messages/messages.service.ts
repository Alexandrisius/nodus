import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CHAT_EVENTS,
  type ChatMessage,
  type ListMessagesQuery,
  type Paginated,
  type SendMessageBody,
} from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import {
  ConversationsRepository,
  type MemberRow,
} from '../conversations/conversations.repository.js';
import { can, parsePermissions } from '../permissions.js';
import { MessageDtoMapper } from './message-dto.mapper.js';
import { MessagesRepository, type MessageRow } from './messages.repository.js';
import { buildReplySnapshot } from './reply-snapshot.js';

const messageCursorSchema = z.object({ s: z.number().int().positive() });

/** Результат удаления: 204-семантика (бесследно) или надгробие. */
export interface DeleteResult {
  message: MessageRow;
  obliterated: boolean;
  members: MemberRow[];
}

export interface SendResult {
  message: MessageRow;
  members: MemberRow[];
  replayed: boolean;
}

// >300 строк — обоснование (I5): транзакция отправки (идемпотентность+seq+вложения+побочные+события)
// неразрывна; правка/удаление разделяют те же инварианты правила следа — единый сервис агрегата.
/**
 * Ядро сообщений: отправка (seq + идемпотентность в БД + outbox в одной
 * транзакции), лента/треды курсором по seq с продвижением прочтения,
 * правка/удаление по правилу следа. Все мутации сообщений начинаются с
 * UPDATE conversations SET last_seq → транзакции беседы сериализуются.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly conversations: ConversationsRepository,
    private readonly mapper: MessageDtoMapper,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  // ===== Чтение =====

  /** Страница ленты/треда (ASC в странице, курсор назад по seq) + продвижение прочтения. */
  async list(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ): Promise<Paginated<ChatMessage>> {
    const membership = await this.conversations.findMembership(conversationId, userId);
    if (!membership) throw DomainException.notFound('Conversation not found');
    const beforeSeq = query.cursor
      ? BigInt(decodeCursor(query.cursor, messageCursorSchema).s)
      : null;
    const { rows, hasMore } = await this.repo.listPage(conversationId, {
      limit: query.limit,
      beforeSeq,
      threadRootId: query.threadRootId ?? null,
    });
    const members = await this.conversations.listMembers([conversationId]);
    const items = await this.mapper.toDtos(rows, { viewerId: userId, members });
    await this.advanceRead(userId, conversationId, rows);
    return {
      items,
      nextCursor: hasMore && rows.length > 0 ? encodeCursor({ s: Number(rows[0]!.seq) }) : null,
    };
  }

  /** Продвижение watermark прочтения при выдаче (read-эндпоинта нет — мок-модель). */
  private async advanceRead(
    userId: string,
    conversationId: string,
    rows: MessageRow[],
  ): Promise<void> {
    const maxSeq = rows.reduce<bigint>((max, row) => (row.seq > max ? row.seq : max), 0n);
    if (maxSeq === 0n) return;
    await this.txRunner.run(async (tx) => {
      const advanced = await this.repo.advanceReadCursor(conversationId, userId, maxSeq, tx);
      if (advanced) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_READ,
          {
            conversationId,
            userId,
            upToSeq: Number(maxSeq),
            readAt: new Date().toISOString(),
          },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
    });
  }

  // ===== Отправка =====

  /**
   * Отправка: транзакция [replay-проверка → валидации → seq → INSERT ON
   * CONFLICT → вложения → гашение черновика/снуза → события]. Идемпотентность
   * двойная: Redis-интерсептор (ADR-0005) на повторе запроса и уникальная
   * пара (author, client_message_id) в БД на crash-окно между реплеем и
   * фиксацией. client_message_id = Idempotency-Key запроса.
   */
  async send(
    userId: string,
    conversationId: string,
    body: SendMessageBody,
    idempotencyKey: string | undefined,
  ): Promise<SendResult> {
    const clientMessageId = idempotencyKey ?? randomUUID();
    return this.txRunner.run(async (tx) => {
      const membership = await this.conversations.findMembership(conversationId, userId, tx);
      if (!membership) throw DomainException.notFound('Conversation not found');

      // Быстрый replay: тот же ключ уже зафиксирован — побочные эффекты сделаны.
      const existing = await this.repo.findExisting(userId, clientMessageId, tx);
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw DomainException.conflict('Idempotency-Key already used for another message');
        }
        return {
          message: existing,
          members: await this.conversations.listMembers([conversationId], tx),
          replayed: true,
        };
      }

      const conversation = await this.conversations.findTypeAndPermissions(conversationId, tx);
      if (!conversation) throw DomainException.notFound('Conversation not found');
      const permissions = parsePermissions(conversation.permissions);
      const threadRootId = body.threadRootId ?? null;

      // Право постить — только на корневые сообщения ленты; треды открыты
      // всем участникам (модель канала новостей: постят избранные, обсуждают все).
      if (
        threadRootId === null &&
        !can(membership.role as 'owner' | 'admin' | 'member', permissions, 'post')
      ) {
        throw DomainException.forbidden('Posting in this conversation requires permission');
      }

      // Валидация треда: ровно один уровень, корень — этой беседы.
      let threadRoot: MessageRow | null = null;
      if (threadRootId !== null) {
        threadRoot = await this.repo.findByIdInConversation(conversationId, threadRootId, tx);
        if (!threadRoot || threadRoot.threadRootId !== null) {
          throw DomainException.notFound('Thread root not found');
        }
      }

      // Снапшот цитаты (оригинал — только этой беседы: чужое не утекает).
      let replySnapshot: ReturnType<typeof buildReplySnapshot> | null = null;
      if (body.replyToId) {
        const original = await this.repo.findByIdInConversation(conversationId, body.replyToId, tx);
        const originalAttachments =
          original && !original.deletedAt ? await this.repo.attachmentsFor([original.id]) : [];
        replySnapshot = buildReplySnapshot(
          original
            ? {
                authorId: original.authorId,
                text: original.text,
                deleted: original.deletedAt !== null,
                attachmentKind: (originalAttachments[0]?.kind as 'image' | 'file') ?? null,
              }
            : null,
          body.quoteText ?? null,
        );
      }

      const seq = await this.repo.allocateSeqs(conversationId, 1, tx);
      const inserted = await this.repo.insertMessage(
        {
          id: randomUUID(),
          conversationId,
          seq,
          authorId: userId,
          clientMessageId,
          text: body.text,
          replyToId: body.replyToId ?? null,
          replySnapshot,
          threadRootId,
          fwd: null,
          createdAt: new Date(),
        },
        tx,
      );
      if (!inserted) {
        // Редкая гонка: фиксация конкурента между SELECT и INSERT — реплей.
        const raced = await this.repo.findExisting(userId, clientMessageId, tx);
        if (!raced) throw new Error('send: ON CONFLICT returned nothing and no existing row');
        return {
          message: raced,
          members: await this.conversations.listMembers([conversationId], tx),
          replayed: true,
        };
      }

      // Вложения одноразовые (мок); активность беседы — только корневые.
      await this.repo.claimAttachments(inserted.id, body.attachmentIds ?? [], userId, tx);
      await this.conversations.clearDraft(conversationId, userId, tx);
      await this.conversations.unsnooze(conversationId, userId, tx);
      if (threadRootId === null) {
        await this.repo.touchLastMessageAt(conversationId, tx);
      } else {
        // Автор корня — участник треда с момента первого ответа (уведомления).
        if (threadRoot && threadRoot.authorId !== userId) {
          await this.repo.upsertThreadParticipant(threadRootId, threadRoot.authorId, 'author', tx);
        }
        await this.repo.upsertThreadParticipant(threadRootId, userId, 'replier', tx);
        const priorReplies = await this.repo.countThreadReplies(threadRootId, inserted.id, tx);
        if (priorReplies === 0) {
          await this.eventBus.emit(
            tx,
            CHAT_EVENTS.THREAD_CREATED,
            { conversationId, threadRootId, messageId: inserted.id },
            { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
          );
        }
      }

      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_SENT,
        {
          conversationId,
          messageId: inserted.id,
          seq: Number(inserted.seq),
          authorId: userId,
          threadRootId,
          forwarded: false,
        },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
      return {
        message: inserted,
        members: await this.conversations.listMembers([conversationId], tx),
        replayed: false,
      };
    });
  }

  // ===== Правка =====

  /** Правка текста: только автор, без давности; editedAt — только при реальной смене. */
  async edit(
    userId: string,
    conversationId: string,
    messageId: string,
    text: string,
  ): Promise<{ message: MessageRow; members: MemberRow[] }> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const message = await this.repo.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      if (message.authorId !== userId) {
        throw DomainException.forbidden('Only author can modify this message');
      }
      // Пересланную копию не правит даже переславший (#111, I8): текст под
      // атрибуцией «Переслано от» принадлежит оригинальному автору — правка
      // позволила бы исказить чужие слова (модель Telegram: только удаление).
      if (message.fwdMessageId) {
        throw DomainException.forbidden('Forwarded messages cannot be edited');
      }
      let updated = message;
      if (message.text !== text) {
        updated = await this.repo.updateEditText(conversationId, messageId, userId, text, tx);
        // readAt сбрасывается выводно (editedAt > last_read_at читателей) —
        // «повторный пуш прочитавшим» (решение #41).
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_EDITED,
          {
            conversationId,
            messageId,
            editedAt: updated.editedAt!.toISOString(),
          },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
      return {
        message: updated,
        members: await this.conversations.listMembers([conversationId], tx),
      };
    });
  }

  // ===== Удаление =====

  /**
   * Удаление одного: «хоть один прочитал (курсор ≥ seq) → надгробие» решает
   * СЕРВЕР по курсорам участников. Оба варианта: авто-unpin, пометка цитат,
   * событие. Бесследное (obliterated) исключается из всех выдач, но строка
   * и seq остаются (непрерывность ссылок/истории/аудита).
   */
  async delete(userId: string, conversationId: string, messageId: string): Promise<DeleteResult> {
    return this.deleteInternal(userId, conversationId, messageId);
  }

  /** Пакетное удаление: чужие/чужой беседы/удалённые пропускаются молча (мок). */
  async batchDelete(
    userId: string,
    conversationId: string,
    messageIds: string[],
  ): Promise<{ removed: string[]; tombstones: { message: MessageRow; members: MemberRow[] }[] }> {
    if (!(await this.conversations.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    const removed: string[] = [];
    const tombstones: { message: MessageRow; members: MemberRow[] }[] = [];
    for (const messageId of messageIds) {
      const message = await this.repo.findByIdInConversation(conversationId, messageId);
      if (!message || message.deletedAt || message.authorId !== userId) continue;
      const result = await this.deleteInternal(userId, conversationId, messageId);
      if (result.obliterated) removed.push(messageId);
      else
        tombstones.push({
          message: result.message,
          members: await this.conversations.listMembers([conversationId]),
        });
    }
    return { removed, tombstones };
  }

  private async deleteInternal(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<DeleteResult> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const message = await this.repo.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      if (message.authorId !== userId) {
        throw DomainException.forbidden('Only author can modify this message');
      }
      const members = await this.conversations.listMembers([conversationId], tx);
      const anyoneRead = members.some((m) => m.userId !== userId && m.lastReadSeq >= message.seq);
      const obliterated = !anyoneRead;
      const tombstone = await this.repo.tombstone(conversationId, messageId, obliterated, tx);
      await this.repo.deletePinByMessage(messageId, tx);
      await this.repo.markRepliesDeleted(messageId, tx);
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_DELETED,
        { conversationId, messageId, obliterated },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
      return { message: tombstone, obliterated, members };
    });
  }
}
