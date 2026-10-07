import { Prisma } from '../../../generated/prisma/client.js';

/**
 * SQL-селект списка бесед одним запросом (LATERAL для lastMessage и
 * unread — индекс (conversation_id, seq) обслуживает оба; масштаб 200–300
 * сотрудников не требует денормализованных счётчиков, watermark
 * last_read_seq каноничен). Вынесен из ConversationsRepository (#243:
 * агрегат перерос 500 строк — селект списка самостоятельная часть).
 */

/** Строка списка бесед (сырой SQL): беседа + участие + черновик + lastMessage + unread. */
export interface ConversationListRow {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  visibility: string | null;
  permissions: Prisma.JsonValue;
  avatar_file_id: string | null;
  last_message_at: Date | null;
  /** Активность для сортировки (#215): last_message_at, для «Избранного» —
   *  GREATEST с последней закладкой владельца (CASE ниже). */
  last_activity_at: Date | null;
  role: string;
  pinned: boolean;
  muted: boolean;
  snoozed: boolean;
  draft_text: string | null;
  draft_revision: number | null;
  draft_updated_at: Date | null;
  unread_count: number;
  my_last_read_seq: bigint;
  lm_id: string | null;
  lm_seq: bigint | null;
  lm_author_id: string | null;
  lm_client_message_id: string | null;
  lm_text: string | null;
  lm_urgent: boolean | null;
  lm_reply_to_id: string | null;
  lm_reply_snapshot: Prisma.JsonValue | null;
  lm_thread_root_id: string | null;
  lm_fwd_conversation_id: string | null;
  lm_fwd_message_id: string | null;
  lm_fwd_author_id: string | null;
  lm_fwd_thread_root_id: string | null;
  lm_edited_at: Date | null;
  lm_deleted_at: Date | null;
  lm_created_at: Date | null;
}

/** Курсор списка бесед: keyset по (last_message_at NULLS LAST, id). */
export interface ConversationListCursor {
  at: string | null;
  id: string;
}

export const LIST_SELECT = (userId: string): Prisma.Sql => Prisma.sql`
  SELECT
    c.id, c.type, c.title, c.description, c.visibility, c.permissions, c.avatar_file_id,
    c.last_message_at,
    CASE WHEN c.type = 'direct' AND c.user_min = c.user_max AND c.user_min = ${userId}::uuid
      THEN GREATEST(
        c.last_message_at,
        (SELECT max(f.created_at) FROM favorites f WHERE f.user_id = ${userId}::uuid)
      )
      ELSE c.last_message_at
    END AS last_activity_at,
    cm.role, cm.pinned, cm.muted, cm.snoozed, cm.last_read_seq AS my_last_read_seq,
    d.text AS draft_text, d.revision AS draft_revision, d.updated_at AS draft_updated_at,
    (SELECT COUNT(*)::int FROM messages um
       WHERE um.conversation_id = c.id
         AND um.author_id <> ${userId}::uuid
         AND um.deleted_at IS NULL
         AND (um.seq > cm.last_read_seq
              OR (um.edited_at IS NOT NULL
                  AND (cm.last_read_at IS NULL OR um.edited_at > cm.last_read_at)))
         AND (c.type <> 'project_channel'
              OR um.thread_root_id IS NULL
              OR EXISTS (
                SELECT 1 FROM thread_participants tp
                WHERE tp.thread_root_id = um.thread_root_id
                  AND tp.user_id = ${userId}::uuid
                  AND um.seq > tp.last_read_seq))) AS unread_count,
    lm.id AS lm_id, lm.seq AS lm_seq, lm.author_id AS lm_author_id,
    lm.client_message_id AS lm_client_message_id, lm.text AS lm_text,
    lm.urgent AS lm_urgent,
    lm.reply_to_id AS lm_reply_to_id, lm.reply_snapshot AS lm_reply_snapshot,
    lm.thread_root_id AS lm_thread_root_id,
    lm.fwd_conversation_id AS lm_fwd_conversation_id, lm.fwd_message_id AS lm_fwd_message_id,
    lm.fwd_author_id AS lm_fwd_author_id, lm.fwd_thread_root_id AS lm_fwd_thread_root_id,
    lm.edited_at AS lm_edited_at, lm.deleted_at AS lm_deleted_at, lm.created_at AS lm_created_at
  FROM conversation_members cm
  JOIN conversations c ON c.id = cm.conversation_id
  LEFT JOIN conversation_drafts d ON d.conversation_id = c.id AND d.user_id = ${userId}::uuid
  LEFT JOIN LATERAL (
    SELECT m.* FROM messages m
    WHERE m.conversation_id = c.id AND m.thread_root_id IS NULL AND NOT m.obliterated
    ORDER BY m.seq DESC
    LIMIT 1
  ) lm ON true
`;
