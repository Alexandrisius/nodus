import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { MESSAGE_COLS, type MessageRow } from './message-row.js';

/**
 * Жизненный цикл сообщения после отправки: правка текста и удаление по
 * правилу следа (#163 — надгробие/бесследно, каскад якорей, авто-unpin,
 * «удаление сильнее заморозки» цитат). Все методы — только внутри
 * транзакции правки/удаления (tx обязателен). Выделен из MessagesRepository
 * (I5: файл агрегата перерос 500 строк).
 */
@Injectable()
export class MessagesLifecycleRepository {
  /** Правка текста (только автор, не надгробие — гарантирует сервис). */
  async updateEditText(
    conversationId: string,
    messageId: string,
    authorId: string,
    text: string,
    mentionedUserIds: string[],
    /** Накопительное множество (#239): union(ever, новая версия). */
    everMentionedUserIds: string[],
    tx: TransactionClient,
  ): Promise<MessageRow> {
    const rows = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      UPDATE messages
      SET text = ${text}, mentioned_user_ids = ${JSON.stringify(mentionedUserIds)}::jsonb,
          ever_mentioned_user_ids = ${JSON.stringify(everMentionedUserIds)}::jsonb,
          edited_at = now(), updated_at = now()
      WHERE id = ${messageId}::uuid AND conversation_id = ${conversationId}::uuid
        AND author_id = ${authorId}::uuid AND deleted_at IS NULL
      RETURNING ${MESSAGE_COLS}
    `);
    if (!rows[0]) throw new Error(`updateEditText: message ${messageId} not updatable`);
    return rows[0];
  }

  /**
   * Удаление: строка остаётся всегда (непрерывность seq, ссылки тредов/цитат,
   * аудит). obliterated=true — «бесследно» (исключается из выдач);
   * false — надгробие (text/цитата затёрты, вложения/реакции скрывает маппер).
   */
  async tombstone(
    conversationId: string,
    messageId: string,
    obliterated: boolean,
    tx: TransactionClient,
  ): Promise<MessageRow> {
    const rows = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      UPDATE messages
      SET deleted_at = now(), text = '', reply_snapshot = NULL,
          obliterated = ${obliterated}, updated_at = now()
      WHERE id = ${messageId}::uuid AND conversation_id = ${conversationId}::uuid
        AND deleted_at IS NULL
      RETURNING ${MESSAGE_COLS}
    `);
    if (!rows[0]) throw new Error(`tombstone: message ${messageId} already deleted`);
    return rows[0];
  }

  /** Авто-unpin при удалении закреплённого (мок-семантика). */
  async deletePinByMessage(messageId: string, tx: TransactionClient): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM conversation_pins WHERE message_id = ${messageId}::uuid
    `);
  }

  /**
   * Живые ответы-якоря (правило следа #163): ответ по reply_to_id или пост
   * треда (для корня треда), не удалённые. Удалённое (в т.ч. надгробие и
   * obliterated — у обоих deleted_at выставлен) якорем не считается.
   */
  async hasLiveReplies(
    conversationId: string,
    messageId: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM messages
        WHERE conversation_id = ${conversationId}::uuid
          AND deleted_at IS NULL
          AND (reply_to_id = ${messageId}::uuid
               OR (thread_root_id = ${messageId}::uuid AND id <> ${messageId}::uuid))
      ) AS exists
    `);
    return rows[0]?.exists === true;
  }

  /**
   * Каскад #163: надгробие-якорь, потерявшее последний живой ответ (условие
   * в том же UPDATE — атомарно, гонки двух параллельных удалений исключены),
   * уходит в бесследное. true — коллапс случился (нужно событие).
   */
  async obliterateTombstone(
    conversationId: string,
    messageId: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE messages
      SET obliterated = true, updated_at = now()
      WHERE id = ${messageId}::uuid AND conversation_id = ${conversationId}::uuid
        AND deleted_at IS NOT NULL AND NOT obliterated
        AND NOT EXISTS (
          SELECT 1 FROM messages r
          WHERE r.conversation_id = messages.conversation_id
            AND r.deleted_at IS NULL
            AND (r.reply_to_id = messages.id
                 OR (r.thread_root_id = messages.id AND r.id <> messages.id))
        )
      RETURNING id
    `);
    return rows.length > 0;
  }

  /** «Удаление сильнее заморозки»: цитаты-ответы → deleted=true. */
  async markRepliesDeleted(messageId: string, tx: TransactionClient): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE messages
      SET reply_snapshot = jsonb_set(reply_snapshot, '{deleted}', 'true'::jsonb),
          updated_at = now()
      WHERE reply_to_id = ${messageId}::uuid AND reply_snapshot IS NOT NULL
    `);
  }
}
