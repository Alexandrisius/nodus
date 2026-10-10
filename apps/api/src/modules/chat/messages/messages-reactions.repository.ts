import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/** Строка реакции сообщения (таблица message_reactions). */
export interface ReactionRow {
  messageId: string;
  emoji: string;
  userId: string;
  createdAt: Date;
}

/**
 * Реакции сообщений — выделено из MessagesRepository (I5 >500, #239:
 * ever-mention-колонка дотяла агрегат до порога). Читает маппер DTO,
 * пишут действия (toggle).
 */
@Injectable()
export class MessagesReactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async reactionsFor(messageIds: string[]): Promise<ReactionRow[]> {
    if (messageIds.length === 0) return [];
    return this.prisma.$queryRaw<ReactionRow[]>(Prisma.sql`
      SELECT message_id AS "messageId", emoji, user_id AS "userId",
             created_at AS "createdAt"
      FROM message_reactions
      WHERE message_id = ANY(${messageIds}::uuid[])
      ORDER BY emoji ASC, created_at ASC, user_id ASC
    `);
  }

  /** Поставить свою реакцию (идемпотентно; false — уже стояла). */
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO message_reactions (message_id, user_id, emoji)
      VALUES (${messageId}::uuid, ${userId}::uuid, ${emoji})
      ON CONFLICT DO NOTHING
      RETURNING user_id AS id
    `);
    return rows.length > 0;
  }

  /** Снять свою реакцию (false — не стояла). */
  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const count = await tx.$executeRaw(Prisma.sql`
      DELETE FROM message_reactions
      WHERE message_id = ${messageId}::uuid AND user_id = ${userId}::uuid AND emoji = ${emoji}
    `);
    return count > 0;
  }
}
