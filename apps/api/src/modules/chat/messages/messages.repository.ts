import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/** Сообщение (сырой SQL-ряд, camelCase-алиасы). seq приходит как bigint. */
export interface MessageRow {
  id: string;
  conversationId: string;
  seq: bigint;
  authorId: string;
  clientMessageId: string;
  text: string;
  replyToId: string | null;
  replySnapshot: Prisma.JsonValue | null;
  threadRootId: string | null;
  fwdConversationId: string | null;
  fwdMessageId: string | null;
  fwdAuthorId: string | null;
  fwdThreadRootId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  obliterated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReactionRow {
  messageId: string;
  emoji: string;
  userId: string;
}

export interface ThreadCountRow {
  rootId: string;
  count: number;
}

export interface PinRow {
  conversationId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: Date;
  message: MessageRow;
}

const MESSAGE_COLS = Prisma.sql`
  id,
  conversation_id AS "conversationId",
  seq,
  author_id AS "authorId",
  client_message_id AS "clientMessageId",
  text,
  reply_to_id AS "replyToId",
  reply_snapshot AS "replySnapshot",
  thread_root_id AS "threadRootId",
  fwd_conversation_id AS "fwdConversationId",
  fwd_message_id AS "fwdMessageId",
  fwd_author_id AS "fwdAuthorId",
  fwd_thread_root_id AS "fwdThreadRootId",
  edited_at AS "editedAt",
  deleted_at AS "deletedAt",
  obliterated,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

// >300 строк — обоснование (I5): один репозиторий на агрегат Message (канон skills/database-repository-pattern);
// идемпотентная вставка, seq-выделение, лента/треды, курсоры прочтения, tombstone, реакции, тред-участники —
// все запросы к таблицам сообщений держатся вместе; дробление по эндпоинтам запрещено каноном.
/**
 * Репозиторий агрегата Message: порядок (seq через лок строки беседы),
 * идемпотентная вставка (ON CONFLICT по автору+client_message_id — crash-окно
 * Redis-реплея закрывает БД), лента/треды курсором по seq, прочитанность
 * watermark-курсором. Все записи сообщений идут ПОСЛЕ UPDATE conversations
 * SET last_seq (лок строки) → транзакции одной беседы сериализуются,
 * порядок seq == порядку коммита.
 *
 * > 300 строк: блоки сырого SQL сообщений (лента/тред/курсор/идемпотентность)
 * держатся вместе ради транзакционных инвариантов; разнос по файлам разбил бы
 * агрегат (обоснование лимита I5).
 */
@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient): PrismaService | TransactionClient {
    return tx ?? this.prisma;
  }

  /**
   * Выделяет `count` подряд идущих seq: инкремент last_seq с возвратом.
   * Лок строки беседы держится до конца транзакции — все вставки сообщений
   * беседы сериализуются (глобальный bigserial так не может: значение
   * выдаётся до коммита, конкурентные транзакции коммитятся вне порядка seq,
   * курсор «после N» теряет сообщения — см. комментарий модели Conversation).
   * Возвращает ПЕРВЫЙ seq диапазона (конец = first + count - 1).
   */
  async allocateSeqs(
    conversationId: string,
    count: number,
    tx: TransactionClient,
  ): Promise<bigint> {
    const rows = await tx.$queryRaw<{ last_seq: bigint }[]>(Prisma.sql`
      UPDATE conversations
      SET last_seq = last_seq + ${count}::bigint, updated_at = now()
      WHERE id = ${conversationId}::uuid
      RETURNING last_seq
    `);
    if (!rows[0]) throw new Error(`allocateSeqs: conversation ${conversationId} not found`);
    return rows[0].last_seq - BigInt(count) + 1n;
  }

  /** Активность беседы — только корневые сообщения (мок: тред не lastMessage). */
  async touchLastMessageAt(conversationId: string, tx: TransactionClient): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE conversations
      SET last_message_at = GREATEST(last_message_at, now()), updated_at = now()
      WHERE id = ${conversationId}::uuid
    `);
  }

  /**
   * Идемпотентная вставка: ON CONFLICT (author_id, client_message_id)
   * DO NOTHING; пустой RETURNING = повтор (replay) → вызывающий делает
   * findExisting. Привязка вложений и побочные эффекты — на вызывающем.
   */
  async insertMessage(
    input: {
      id: string;
      conversationId: string;
      seq: bigint;
      authorId: string;
      clientMessageId: string;
      text: string;
      replyToId: string | null;
      replySnapshot: object | null;
      threadRootId: string | null;
      fwd: {
        conversationId: string;
        messageId: string;
        authorId: string;
        threadRootId: string | null;
      } | null;
      createdAt: Date;
    },
    tx: TransactionClient,
  ): Promise<MessageRow | null> {
    const snapshot = input.replySnapshot === null ? null : JSON.stringify(input.replySnapshot);
    const rows = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      INSERT INTO messages (
        id, conversation_id, seq, author_id, client_message_id, text,
        reply_to_id, reply_snapshot, thread_root_id,
        fwd_conversation_id, fwd_message_id, fwd_author_id, fwd_thread_root_id,
        created_at, updated_at
      ) VALUES (
        ${input.id}::uuid, ${input.conversationId}::uuid, ${input.seq}::bigint,
        ${input.authorId}::uuid, ${input.clientMessageId}, ${input.text},
        ${input.replyToId}::uuid, ${snapshot}::jsonb, ${input.threadRootId}::uuid,
        ${input.fwd?.conversationId ?? null}::uuid, ${input.fwd?.messageId ?? null}::uuid,
        ${input.fwd?.authorId ?? null}::uuid, ${input.fwd?.threadRootId ?? null}::uuid,
        ${input.createdAt}::timestamptz, ${input.createdAt}::timestamptz
      )
      ON CONFLICT (author_id, client_message_id) DO NOTHING
      RETURNING ${MESSAGE_COLS}
    `);
    return rows[0] ?? null;
  }

  /** Существующее сообщение по идемпотентной паре (replay-ветка). */
  async findExisting(
    authorId: string,
    clientMessageId: string,
    tx?: TransactionClient,
  ): Promise<MessageRow | null> {
    const client = this.client(tx);
    const rows = await client.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${MESSAGE_COLS} FROM messages
      WHERE author_id = ${authorId}::uuid AND client_message_id = ${clientMessageId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  /** Сообщение строго в беседе (не палит чужие беседы). */
  async findByIdInConversation(
    conversationId: string,
    messageId: string,
    tx?: TransactionClient,
  ): Promise<MessageRow | null> {
    const client = this.client(tx);
    const rows = await client.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${MESSAGE_COLS} FROM messages
      WHERE conversation_id = ${conversationId}::uuid AND id = ${messageId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  /** Сообщения по id (для маппера: оригиналы цитат; надгробия включительно). */
  async findByIds(messageIds: string[]): Promise<MessageRow[]> {
    if (messageIds.length === 0) return [];
    return this.prisma.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${MESSAGE_COLS} FROM messages WHERE id = ANY(${messageIds}::uuid[])
    `);
  }

  /** Живые (не obliterated) источники пересылки в исходной беседе, порядок запроса. */
  async findForwardSources(
    sourceConversationId: string,
    messageIds: string[],
    tx?: TransactionClient,
  ): Promise<MessageRow[]> {
    const client = this.client(tx);
    const rows = await client.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${MESSAGE_COLS} FROM messages
      WHERE conversation_id = ${sourceConversationId}::uuid
        AND id = ANY(${messageIds}::uuid[])
        AND NOT obliterated
        AND deleted_at IS NULL
    `);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return messageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  /**
   * Страница ленты (новейшие → назад) или треда (корень первым на первой
   * странице + ответы новейшие→назад). Возврат — ASC внутри страницы,
   * hasMore по limit+1. Надгробия в выдаче, obliterated — никогда.
   */
  async listPage(
    conversationId: string,
    opts: { limit: number; beforeSeq: bigint | null; threadRootId: string | null },
  ): Promise<{ rows: MessageRow[]; hasMore: boolean }> {
    if (opts.threadRootId === null) {
      // Лента без threadRootId — ВСЕ сообщения беседы, включая ответы тредов
      // (мок-контракт: прямые/групповые беседы рендерят ответы инлайн —
      // conversation-pane; «только корни» — клиентский фильтр канального вида
      // thread-feed.tsx, сервер его не решает). lastMessage при этом — только
      // корневое (LATERAL-фильтр), как в моках.
      const rows = await this.prisma.$queryRaw<MessageRow[]>(Prisma.sql`
        SELECT ${MESSAGE_COLS} FROM messages
        WHERE conversation_id = ${conversationId}::uuid
          AND NOT obliterated
          AND (${opts.beforeSeq === null} OR seq < ${opts.beforeSeq?.toString() ?? '0'}::bigint)
        ORDER BY seq DESC
        LIMIT ${opts.limit + 1}
      `);
      return this.cutPage(rows.reverse(), opts.limit);
    }
    const replies = await this.prisma.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${MESSAGE_COLS} FROM messages
      WHERE conversation_id = ${conversationId}::uuid
        AND thread_root_id = ${opts.threadRootId}::uuid
        AND NOT obliterated
        AND (${opts.beforeSeq === null} OR seq < ${opts.beforeSeq?.toString() ?? '0'}::bigint)
      ORDER BY seq DESC
      LIMIT ${opts.limit + 1}
    `);
    const page = this.cutPage(replies.reverse(), opts.limit);
    if (opts.beforeSeq === null) {
      const roots = await this.prisma.$queryRaw<MessageRow[]>(Prisma.sql`
        SELECT ${MESSAGE_COLS} FROM messages
        WHERE conversation_id = ${conversationId}::uuid AND id = ${opts.threadRootId}::uuid
          AND NOT obliterated
        LIMIT 1
      `);
      if (roots[0]) page.rows.unshift(roots[0]);
    }
    return page;
  }

  private cutPage(rowsAsc: MessageRow[], limit: number): { rows: MessageRow[]; hasMore: boolean } {
    const hasMore = rowsAsc.length > limit;
    return { rows: hasMore ? rowsAsc.slice(rowsAsc.length - limit) : rowsAsc, hasMore };
  }

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

  /** Правка текста (только автор, не надгробие — гарантирует сервис). */
  async updateEditText(
    conversationId: string,
    messageId: string,
    authorId: string,
    text: string,
    tx: TransactionClient,
  ): Promise<MessageRow> {
    const rows = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      UPDATE messages
      SET text = ${text}, edited_at = now(), updated_at = now()
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

  /** «Удаление сильнее заморозки»: цитаты-ответы → deleted=true. */
  async markRepliesDeleted(messageId: string, tx: TransactionClient): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE messages
      SET reply_snapshot = jsonb_set(reply_snapshot, '{deleted}', 'true'::jsonb),
          updated_at = now()
      WHERE reply_to_id = ${messageId}::uuid AND reply_snapshot IS NOT NULL
    `);
  }

  /** Одноразовая привязка загруженных вложений (неизвестные молча пропускаются). */
  async claimAttachments(
    messageId: string,
    attachmentIds: string[],
    ownerId: string,
    tx: TransactionClient,
  ): Promise<void> {
    if (attachmentIds.length === 0) return;
    await tx.$executeRaw(Prisma.sql`
      UPDATE message_attachments ma
      SET message_id = ${messageId}::uuid, sort_order = ord.ordinal - 1
      FROM unnest(${attachmentIds}::uuid[]) WITH ORDINALITY AS ord(id, ordinal)
      WHERE ma.id = ord.id AND ma.owner_id = ${ownerId}::uuid AND ma.message_id IS NULL
    `);
  }

  /**
   * Копии вложений пересылки: новые строки-метаданные с тем же file_id —
   * «по ссылке» на уровне файла (перекачки нет), у каждого сообщения своя
   * строка (FK message_id одиночный).
   */
  async copyAttachments(
    sourceMessageId: string,
    targetMessageId: string,
    tx: TransactionClient,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO message_attachments (
        id, message_id, file_id, owner_id, name, size, mime, kind, width, height, sort_order
      )
      SELECT gen_random_uuid(), ${targetMessageId}::uuid, file_id, owner_id, name, size,
             mime, kind, width, height, sort_order
      FROM message_attachments WHERE message_id = ${sourceMessageId}::uuid
    `);
  }

  /** Вложения сообщений (для маппера). */
  async attachmentsFor(messageIds: string[]): Promise<
    {
      messageId: string;
      id: string;
      name: string;
      size: number;
      mime: string;
      kind: string;
      width: number | null;
      height: number | null;
      sortOrder: number;
    }[]
  > {
    if (messageIds.length === 0) return [];
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT message_id AS "messageId", id, name, size, mime, kind, width, height, sort_order AS "sortOrder"
      FROM message_attachments
      WHERE message_id = ANY(${messageIds}::uuid[])
      ORDER BY sort_order ASC, id ASC
    `);
  }

  async reactionsFor(messageIds: string[]): Promise<ReactionRow[]> {
    if (messageIds.length === 0) return [];
    return this.prisma.$queryRaw<ReactionRow[]>(Prisma.sql`
      SELECT message_id AS "messageId", emoji, user_id AS "userId"
      FROM message_reactions
      WHERE message_id = ANY(${messageIds}::uuid[])
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

  /** Живые ответы тредов (счётчик в DTO; удалённые не считаются). */
  async threadReplyCounts(rootIds: string[]): Promise<ThreadCountRow[]> {
    if (rootIds.length === 0) return [];
    return this.prisma.$queryRaw<ThreadCountRow[]>(Prisma.sql`
      SELECT thread_root_id AS "rootId", COUNT(*)::int AS count
      FROM messages
      WHERE thread_root_id = ANY(${rootIds}::uuid[]) AND deleted_at IS NULL AND NOT obliterated
      GROUP BY thread_root_id
    `);
  }

  /** Участники треда (уведомления — только им; заполняется с первого ответа). */
  async upsertThreadParticipant(
    threadRootId: string,
    userId: string,
    source: 'author' | 'replier' | 'watcher',
    tx: TransactionClient,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO thread_participants (thread_root_id, user_id, source)
      VALUES (${threadRootId}::uuid, ${userId}::uuid, ${source})
      ON CONFLICT DO NOTHING
    `);
  }

  /** Ответы треда, кроме исключаемого (детект «первый ответ» для события). */
  async countThreadReplies(
    threadRootId: string,
    excludeMessageId: string,
    tx: TransactionClient,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM messages
      WHERE thread_root_id = ${threadRootId}::uuid AND id <> ${excludeMessageId}::uuid
    `);
    return rows[0]?.count ?? 0;
  }

  /** Все ответы треда (живые и надгробия; детект «тред существовал» пересылки). */
  async countAllThreadReplies(threadRootId: string, tx: TransactionClient): Promise<number> {
    const rows = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM messages
      WHERE thread_root_id = ${threadRootId}::uuid
    `);
    return rows[0]?.count ?? 0;
  }
}
