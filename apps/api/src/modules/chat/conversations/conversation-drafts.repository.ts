import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

export interface DraftRow {
  text: string;
  revision: number;
  updatedAt: Date;
}

/**
 * Черновики композера (`conversation_drafts`): PUT (LWW, revision растит
 * сервер) и гашение в транзакции отправки. Чистка черновика исключённого —
 * в ConversationMembersRepository.removeMember (атомарно с исключением).
 * Выделено из ConversationsRepository (I5).
 */
@Injectable()
export class ConversationDraftsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** PUT черновика: пустой текст — удаление; revision монотонно растит сервер. */
  async putDraft(conversationId: string, userId: string, text: string): Promise<DraftRow | null> {
    if (text === '') {
      await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM conversation_drafts
        WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
      `);
      return null;
    }
    const rows = await this.prisma.$queryRaw<DraftRow[]>(Prisma.sql`
      INSERT INTO conversation_drafts (conversation_id, user_id, text, revision, updated_at)
      VALUES (${conversationId}::uuid, ${userId}::uuid, ${text},
              1, now())
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET text = ${text}, revision = conversation_drafts.revision + 1, updated_at = now()
      RETURNING text, revision, updated_at AS "updatedAt"
    `);
    return rows[0] ?? null;
  }

  /** Гашение черновика в транзакции отправки (урок tdesktop#26236). */
  async clearDraft(conversationId: string, userId: string, tx: TransactionClient): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM conversation_drafts
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    `);
  }
}
