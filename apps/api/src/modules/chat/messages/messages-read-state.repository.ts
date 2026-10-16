import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/**
 * Прочитанность беседы — watermark-курсор участника (#102 раунд 2):
 * `conversation_members.last_read_seq/last_read_at`. Двигают ТОЛЬКО
 * квитанции POST /read; выдача ленты его не трогает. Watermark трэда —
 * thread-participants.repository. Выделен из MessagesRepository (I5).
 */
@Injectable()
export class MessagesReadStateRepository {
  /**
   * Продвижение watermark прочтения: seq монотонно (GREATEST — stale-устройство
   * не откатит), last_read_at обновляется и при догоне правок (иначе readAt
   * «повторного прочтения» после edit никогда не восстановится — курсор уже
   * был впереди). Возвращает факт изменения и фактическое время прочтения
   * (для payload события — не now() на эмите).
   */
  async advanceReadCursor(
    conversationId: string,
    userId: string,
    upToSeq: bigint,
    tx: TransactionClient,
  ): Promise<{ advanced: boolean; lastReadAt: Date | null }> {
    const rows = await tx.$queryRaw<{ last_read_seq: bigint; last_read_at: Date }[]>(Prisma.sql`
      UPDATE conversation_members m
      SET last_read_seq = GREATEST(m.last_read_seq, ${upToSeq.toString()}::bigint),
          last_read_at = now(),
          updated_at = now()
      WHERE m.conversation_id = ${conversationId}::uuid AND m.user_id = ${userId}::uuid
        AND (m.last_read_seq < ${upToSeq.toString()}::bigint
             OR m.last_read_at IS NULL
             OR EXISTS (
               SELECT 1 FROM messages msg
               WHERE msg.conversation_id = ${conversationId}::uuid
                 AND msg.author_id <> ${userId}::uuid
                 AND msg.deleted_at IS NULL
                 AND msg.edited_at IS NOT NULL
                 AND msg.edited_at > m.last_read_at
             ))
      RETURNING m.last_read_seq, m.last_read_at
    `);
    return { advanced: rows.length > 0, lastReadAt: rows[0]?.last_read_at ?? null };
  }
}
