import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { MessageRow } from './messages.repository.js';

export interface PinRecord {
  conversationId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: Date;
}

/**
 * Репозиторий закрепов: одно закрепление на сообщение (partial unique),
 * лента закрепов — свежие первыми (мок: unshift-история).
 */
@Injectable()
export class MessagePinsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Закрепы беседы с самими сообщениями (снапшот обязателен — контракт). */
  async listWithMessages(
    conversationId: string,
  ): Promise<{ pin: PinRecord; message: MessageRow }[]> {
    const pins = await this.prisma.$queryRaw<PinRecord[]>(Prisma.sql`
      SELECT conversation_id AS "conversationId", message_id AS "messageId",
             pinned_by AS "pinnedBy", pinned_at AS "pinnedAt"
      FROM conversation_pins
      WHERE conversation_id = ${conversationId}::uuid
      ORDER BY pinned_at DESC, message_id ASC
    `);
    if (pins.length === 0) return [];
    const ids = pins.map((p) => p.messageId);
    const messages = await this.prisma.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT id, conversation_id AS "conversationId", seq, author_id AS "authorId",
             client_message_id AS "clientMessageId", text, reply_to_id AS "replyToId",
             reply_snapshot AS "replySnapshot", thread_root_id AS "threadRootId",
             fwd_conversation_id AS "fwdConversationId", fwd_message_id AS "fwdMessageId",
             fwd_author_id AS "fwdAuthorId", fwd_thread_root_id AS "fwdThreadRootId",
             edited_at AS "editedAt", deleted_at AS "deletedAt", obliterated,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM messages WHERE id = ANY(${ids}::uuid[])
    `);
    const byId = new Map(messages.map((m) => [m.id, m]));
    return pins.flatMap((pin) => {
      const message = byId.get(pin.messageId);
      return message ? [{ pin, message }] : [];
    });
  }

  /**
   * Закрепить (идемпотентно): false = уже закреплено — вызывающий вернёт
   * существующий пин с оригинальными pinnedBy/pinnedAt (мок-семантика).
   */
  async pin(
    conversationId: string,
    messageId: string,
    pinnedBy: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ message_id: string }[]>(Prisma.sql`
      INSERT INTO conversation_pins (conversation_id, message_id, pinned_by)
      VALUES (${conversationId}::uuid, ${messageId}::uuid, ${pinnedBy}::uuid)
      ON CONFLICT (message_id) DO NOTHING
      RETURNING message_id AS "message_id"
    `);
    return rows.length > 0;
  }

  async findByMessage(messageId: string): Promise<PinRecord | null> {
    const rows = await this.prisma.$queryRaw<PinRecord[]>(Prisma.sql`
      SELECT conversation_id AS "conversationId", message_id AS "messageId",
             pinned_by AS "pinnedBy", pinned_at AS "pinnedAt"
      FROM conversation_pins WHERE message_id = ${messageId}::uuid LIMIT 1
    `);
    return rows[0] ?? null;
  }

  /** Какие из сообщений закреплены (флаг pinned в DTO ленты). */
  async pinnedIds(messageIds: string[]): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT message_id AS id FROM conversation_pins
      WHERE message_id = ANY(${messageIds}::uuid[])
    `);
    return new Set(rows.map((r) => r.id));
  }

  /** Открепить в беседе; false — не был закреплён. */
  async unpin(conversationId: string, messageId: string, tx: TransactionClient): Promise<boolean> {
    const count = await tx.$executeRaw(Prisma.sql`
      DELETE FROM conversation_pins
      WHERE conversation_id = ${conversationId}::uuid AND message_id = ${messageId}::uuid
    `);
    return count > 0;
  }
}
