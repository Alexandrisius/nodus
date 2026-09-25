import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { ConversationPermissions } from '@nodus/contracts';
import { mergePermissions } from '../permissions.js';

/** Строка списка бесед (сырой SQL): беседа + участие + черновик + lastMessage + unread. */
export interface ConversationListRow {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  visibility: string | null;
  permissions: Prisma.JsonValue;
  last_message_at: Date | null;
  role: string;
  pinned: boolean;
  muted: boolean;
  snoozed: boolean;
  draft_text: string | null;
  draft_revision: number | null;
  draft_updated_at: Date | null;
  unread_count: number;
  lm_id: string | null;
  lm_seq: bigint | null;
  lm_author_id: string | null;
  lm_text: string | null;
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

export interface MemberRow {
  conversationId: string;
  userId: string;
  role: string;
  lastReadSeq: bigint;
  lastReadAt: Date | null;
  pinned: boolean;
  muted: boolean;
  snoozed: boolean;
  hidden: boolean;
}

export interface DraftRow {
  text: string;
  revision: number;
  updatedAt: Date;
}

/** Курсор списка бесед: keyset по (last_message_at NULLS LAST, id). */
export interface ConversationListCursor {
  at: string | null;
  id: string;
}

interface ListOpts {
  limit: number;
  cursor?: ConversationListCursor;
  searchTitle?: string;
  searchUserIds?: string[];
}

const LIST_SELECT = (userId: string): Prisma.Sql => Prisma.sql`
  SELECT
    c.id, c.type, c.title, c.description, c.visibility, c.permissions, c.last_message_at,
    cm.role, cm.pinned, cm.muted, cm.snoozed,
    d.text AS draft_text, d.revision AS draft_revision, d.updated_at AS draft_updated_at,
    (SELECT COUNT(*)::int FROM messages um
       WHERE um.conversation_id = c.id
         AND um.author_id <> ${userId}::uuid
         AND um.deleted_at IS NULL
         AND (um.seq > cm.last_read_seq
              OR (um.edited_at IS NOT NULL
                  AND (cm.last_read_at IS NULL OR um.edited_at > cm.last_read_at)))) AS unread_count,
    lm.id AS lm_id, lm.seq AS lm_seq, lm.author_id AS lm_author_id, lm.text AS lm_text,
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

// >300 строк — обоснование (I5): один репозиторий на агрегат (канон skills/database-repository-pattern);
// raw-SQL список LATERAL, find-or-create direct с гонкоустойчивостью и черновики — части ОДНОГО агрегата.
/**
 * Репозиторий агрегата Conversation: участники, настройки списка, черновики,
 * список бесед одним запросом (LATERAL для lastMessage и unread — индекс
 * (conversation_id, seq) обслуживает оба; масштаб 200–300 сотрудников не
 * требует денормализованных счётчиков, watermark last_read_seq каноничен).
 */
@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient): PrismaService | TransactionClient {
    return tx ?? this.prisma;
  }

  /** Страница бесед пользователя (hidden исключены; hasMore = limit+1). */
  async listForUser(userId: string, opts: ListOpts): Promise<ConversationListRow[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`cm.user_id = ${userId}::uuid`,
      Prisma.sql`cm.hidden = false`,
    ];
    if (opts.searchTitle !== undefined) {
      const like = `%${opts.searchTitle}%`;
      const searchUserIds = opts.searchUserIds ?? [];
      conditions.push(Prisma.sql`(
        c.title ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM conversation_members sm
          WHERE sm.conversation_id = c.id
            AND sm.user_id = ANY(${searchUserIds}::uuid[])
        )
      )`);
    }
    if (opts.cursor) {
      // NULLS LAST через infinity-сентинел: сравнение строк корректно для NULL.
      const at = opts.cursor.at ?? null;
      conditions.push(Prisma.sql`(
        COALESCE(c.last_message_at, 'infinity'::timestamptz), c.id
      ) < (
        COALESCE(${at}::timestamptz, 'infinity'::timestamptz), ${opts.cursor.id}::uuid
      )`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const rows = await this.prisma.$queryRaw<ConversationListRow[]>(Prisma.sql`
      ${LIST_SELECT(userId)}
      WHERE ${where}
      ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
      LIMIT ${opts.limit + 1}
    `);
    return rows;
  }

  /** Одна беседа в форме строки списка (ответ PATCH/создания; null — не член). */
  async findListItem(conversationId: string, userId: string): Promise<ConversationListRow | null> {
    const rows = await this.prisma.$queryRaw<ConversationListRow[]>(Prisma.sql`
      ${LIST_SELECT(userId)}
      WHERE cm.user_id = ${userId}::uuid AND cm.conversation_id = ${conversationId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async findTypeAndPermissions(
    conversationId: string,
    tx?: TransactionClient,
  ): Promise<{ id: string; type: string; permissions: Prisma.JsonValue } | null> {
    const client = this.client(tx);
    const rows = await client.$queryRaw<
      { id: string; type: string; permissions: Prisma.JsonValue }[]
    >(Prisma.sql`
      SELECT id, type, permissions FROM conversations WHERE id = ${conversationId}::uuid LIMIT 1
    `);
    return rows[0] ?? null;
  }

  /**
   * Find-or-create direct: нормализованная пара (user_min <= user_max, равны
   * у «Заметок») + частичный уникальный индекс. Гонку закрывает ON CONFLICT:
   * INSERT ждёт конкурента, при его коммите возвращает 0 строк → повторный
   * SELECT. Advisory-локи не нужны (уникальный индекс — арбитр).
   */
  async findOrCreateDirect(
    userId: string,
    peerId: string,
    tx?: TransactionClient,
  ): Promise<{ id: string; created: boolean }> {
    const client = this.client(tx);
    const userMin = userId < peerId ? userId : peerId;
    const userMax = userId < peerId ? peerId : userId;
    const existing = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations
      WHERE type = 'direct' AND user_min = ${userMin}::uuid AND user_max = ${userMax}::uuid
      LIMIT 1
    `);
    if (existing[0]) return { id: existing[0].id, created: false };

    const permissions = mergePermissions();
    const inserted = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO conversations (id, type, permissions, created_by, user_min, user_max, updated_at)
      VALUES (${randomUUID()}::uuid, 'direct', ${JSON.stringify(permissions)}::jsonb,
              ${userId}::uuid, ${userMin}::uuid, ${userMax}::uuid, now())
      ON CONFLICT (user_min, user_max) WHERE type = 'direct' DO NOTHING
      RETURNING id
    `);
    if (inserted[0]) {
      await this.addDirectMembers(inserted[0].id, userMin, userMax, client);
      return { id: inserted[0].id, created: true };
    }
    // Конкурент выиграл-insert: повторный SELECT видит его коммит (READ COMMITTED).
    const raced = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations
      WHERE type = 'direct' AND user_min = ${userMin}::uuid AND user_max = ${userMax}::uuid
      LIMIT 1
    `);
    if (!raced[0]) {
      // Обе ветки пусты: конкурент откатился между INSERT и SELECT — повторяем вставку.
      const retry = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO conversations (id, type, permissions, created_by, user_min, user_max, updated_at)
        VALUES (${randomUUID()}::uuid, 'direct', ${JSON.stringify(permissions)}::jsonb,
                ${userId}::uuid, ${userMin}::uuid, ${userMax}::uuid, now())
        ON CONFLICT (user_min, user_max) WHERE type = 'direct' DO NOTHING
        RETURNING id
      `);
      if (!retry[0]) throw new Error('find-or-create direct: unexpected double race');
      await this.addDirectMembers(retry[0].id, userMin, userMax, client);
      return { id: retry[0].id, created: true };
    }
    return { id: raced[0].id, created: false };
  }

  private async addDirectMembers(
    conversationId: string,
    userMin: string,
    userMax: string,
    client: PrismaService | TransactionClient,
  ): Promise<void> {
    const role = 'member';
    await client.$executeRaw(Prisma.sql`
      INSERT INTO conversation_members (conversation_id, user_id, role, updated_at)
      VALUES (${conversationId}::uuid, ${userMin}::uuid, ${role}, now()),
             (${conversationId}::uuid, ${userMax}::uuid, ${role}, now())
      ON CONFLICT DO NOTHING
    `);
  }

  /** Создание группы/канала: создатель — owner, участники — member. */
  async createGroup(
    input: {
      type: 'group' | 'project_channel';
      title: string;
      description: string | null;
      visibility: string | null;
      permissions: ConversationPermissions;
      createdBy: string;
      memberIds: string[];
    },
    tx?: TransactionClient,
  ): Promise<string> {
    const client = this.client(tx);
    const id = randomUUID();
    await client.conversation.create({
      data: {
        id,
        type: input.type,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        permissions: input.permissions as Prisma.InputJsonValue,
        createdBy: input.createdBy,
        members: {
          create: [
            { userId: input.createdBy, role: 'owner' },
            ...input.memberIds.map((userId) => ({ userId, role: 'member' })),
          ],
        },
      },
      select: { id: true },
    });
    return id;
  }

  /** Участие пользователя (null — не член/беседы нет: одинаково, чтобы не палить). */
  async findMembership(
    conversationId: string,
    userId: string,
    tx?: TransactionClient,
  ): Promise<MemberRow | null> {
    const client = this.client(tx);
    const rows = await client.$queryRaw<MemberRow[]>(Prisma.sql`
      SELECT conversation_id AS "conversationId", user_id AS "userId", role,
             last_read_seq AS "lastReadSeq", last_read_at as "lastReadAt",
             pinned, muted, snoozed, hidden
      FROM conversation_members
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  /** Персьональные настройки списка (pinned/muted/snoozed/hidden). */
  async updateMemberSettings(
    conversationId: string,
    userId: string,
    patch: { pinned?: boolean; muted?: boolean; snoozed?: boolean; hidden?: boolean },
    tx?: TransactionClient,
  ): Promise<void> {
    const client = this.client(tx);
    const sets: Prisma.Sql[] = [];
    if (patch.pinned !== undefined) sets.push(Prisma.sql`pinned = ${patch.pinned}`);
    if (patch.muted !== undefined) sets.push(Prisma.sql`muted = ${patch.muted}`);
    if (patch.snoozed !== undefined) sets.push(Prisma.sql`snoozed = ${patch.snoozed}`);
    if (patch.hidden !== undefined) sets.push(Prisma.sql`hidden = ${patch.hidden}`);
    if (sets.length === 0) return;
    await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET ${Prisma.join(sets, ', ')}, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    `);
  }

  /** Участники бесед(ы) — membersPreview, курсоры прочтения, роли. */
  async listMembers(conversationIds: string[], tx?: TransactionClient): Promise<MemberRow[]> {
    const client = this.client(tx);
    if (conversationIds.length === 0) return [];
    return client.$queryRaw<MemberRow[]>(Prisma.sql`
      SELECT conversation_id AS "conversationId", user_id AS "userId", role,
             last_read_seq AS "lastReadSeq", last_read_at as "lastReadAt",
             pinned, muted, snoozed, hidden
      FROM conversation_members
      WHERE conversation_id = ANY(${conversationIds}::uuid[])
      ORDER BY joined_at ASC, user_id ASC
    `);
  }

  /** Гашение snoozed при своей отправке/пересылке (мок-семантика). */
  async unsnooze(conversationId: string, userId: string, tx?: TransactionClient): Promise<void> {
    const client = this.client(tx);
    await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET snoozed = false, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid AND snoozed
    `);
  }

  /**
   * Активность раскрывает беседу у ВСЕХ скрывших её участников (модель
   * Битрикс24, #103): чужая/своя отправка и пересылка возвращают беседу в
   * список — скрывают только «старые» чаты, чтобы не висели сверху. Той же
   * транзакцией, что и активность; список с `hidden=false` подхватит сам.
   */
  async revealHidden(conversationId: string, tx?: TransactionClient): Promise<void> {
    const client = this.client(tx);
    await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET hidden = false, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND hidden
    `);
  }

  /** Черновик пользователя в беседе. */
  async findDraft(conversationId: string, userId: string): Promise<DraftRow | null> {
    const rows = await this.prisma.$queryRaw<DraftRow[]>(Prisma.sql`
      SELECT text, revision, updated_at AS "updatedAt"
      FROM conversation_drafts
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

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
