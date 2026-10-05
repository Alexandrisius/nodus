import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { MessageRow } from '../messages/messages.repository.js';
import type { ListFavoritesQuery } from '@nodus/contracts';

/** Строка закладки с оригиналом (JOIN для карточки). */
export interface FavoriteRow {
  userId: string;
  messageId: string;
  labels: unknown;
  createdAt: Date;
  updatedAt: Date;
  message: MessageRow;
  /** Беседа-источник (title/type для подписи карточки). */
  conversation: { id: string; type: string; title: string | null };
}

/** Курсор списка: keyset (createdAt DESC, messageId DESC) — момент закладки. */
export interface FavoriteCursor {
  t: string;
  id: string;
}

/** include оригинала с беседой-источником (карточка = живая ссылка). */
const CARD_INCLUDE = {
  message: { include: { conversation: { select: { id: true, type: true, title: true } } } },
} satisfies Prisma.FavoriteInclude;

type CardRecord = Prisma.FavoriteGetPayload<{ include: typeof CARD_INCLUDE }>;

function toRow(record: CardRecord): FavoriteRow {
  return {
    userId: record.userId,
    messageId: record.messageId,
    labels: record.labels,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    message: record.message as unknown as MessageRow,
    conversation: record.message.conversation,
  };
}

/** Обрезка страницы Prisma-пути: +1 строка — детектор следующей страницы. */
function finishPage(
  rows: CardRecord[],
  limit: number,
): { rows: FavoriteRow[]; nextCursor: FavoriteCursor | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next =
    rows.length > limit && last ? { t: last.createdAt.toISOString(), id: last.messageId } : null;
  return { rows: page.map(toRow), nextCursor: next };
}

/**
 * Единственная точка доступа модуля к таблице `favorites` (#171). Контент
 * карточки живёт в оригинале: строки читаются с message (+conversation);
 * приватность — только беседы, где владелец закладки участник (relation
 * filter в list, проверка membership в add).
 */
@Injectable()
export class FavoritesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: ListFavoritesQuery,
    cursor: FavoriteCursor | null,
  ): Promise<{ rows: FavoriteRow[]; nextCursor: FavoriteCursor | null }> {
    // Фильтры label (элемент массива JSONB — эмодзи-строка) и q (ILIKE по
    // тексту оригинала) не выражаются Prisma-фильтрами корректно
    // (array_contains требует точный элемент) — RAW keyset-запрос с теми же
    // инвариантами списка: приватность (только беседы, где владелец
    // участник) и сортировка.
    if (query.label || query.q) {
      return this.listRaw(userId, query, cursor);
    }
    const where: Prisma.FavoriteWhereInput = {
      userId,
      message: {
        is: {
          // Приватность: контент оригинала доступен только участникам беседы —
          // закладка исключённого из беседы перестаёт выдаваться (не раскрываем).
          // Призраки удалённых не выдаются (#215): каскад в MessagesService
          // чистит строки при удалении оригинала, фильтр — страховка на
          // переходный период и реплеи.
          AND: [
            { conversation: { is: { members: { some: { userId } } } } },
            { deletedAt: null, obliterated: false },
            ...(query.conversationId ? [{ conversationId: query.conversationId }] : []),
          ],
        },
      },
    };
    const rows = await this.prisma.favorite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { messageId: 'desc' }],
      take: query.limit + 1,
      ...(cursor
        ? {
            cursor: { userId_messageId: { userId, messageId: cursor.id } },
            skip: 1,
          }
        : {}),
      include: CARD_INCLUDE,
    });
    return finishPage(rows, query.limit);
  }

  /** RAW-путь фильтров label/q: та же выдача, что в list (ключ-страница —
   *  favorited ключ (created_at DESC, message_id DESC)); страница id →
   *  повторный include-запрос (карточный маппер получает те же строки). */
  private async listRaw(
    userId: string,
    query: ListFavoritesQuery,
    cursor: FavoriteCursor | null,
  ): Promise<{ rows: FavoriteRow[]; nextCursor: FavoriteCursor | null }> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`f.user_id = ${userId}::uuid`,
      // Приватность: только беседы, где владелец — участник.
      Prisma.sql`EXISTS (
        SELECT 1 FROM conversation_members cm
        WHERE cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}::uuid
      )`,
      // Призраки удалённых оригиналов не выдаются (#215) — см. list.
      Prisma.sql`m.deleted_at IS NULL AND m.obliterated = false`,
    ];
    if (query.conversationId) {
      conditions.push(Prisma.sql`m.conversation_id = ${query.conversationId}::uuid`);
    }
    if (query.label) {
      // Эмодзи-метка: элемент массива labels — строка (vars-объект: значение
      // едет параметром, не интерполяцией пути).
      conditions.push(
        Prisma.sql`jsonb_path_exists(f.labels, '$[*] ? (@ == $label)', ${JSON.stringify({ label: query.label })}::jsonb)`,
      );
    }
    if (query.q) {
      // Поиск: подстрока в тексте оригинала (без регистра).
      conditions.push(Prisma.sql`m.text ILIKE ${'%' + query.q + '%'}`);
    }
    if (cursor) {
      conditions.push(
        Prisma.sql`(f.created_at, f.message_id) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
    const page = await this.prisma.$queryRaw<{ message_id: string; created_at: Date }[]>(Prisma.sql`
      SELECT f.message_id, f.created_at
      FROM favorites f
      JOIN messages m ON m.id = f.message_id
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY f.created_at DESC, f.message_id DESC
      LIMIT ${query.limit + 1}
    `);
    if (page.length === 0) return { rows: [], nextCursor: null };
    const ids = page.map((row) => row.message_id);
    const rows = await this.prisma.favorite.findMany({
      where: { userId, messageId: { in: ids } },
      include: CARD_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.messageId, row]));
    const ordered = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    const slice = ordered.slice(0, query.limit);
    const lastRaw = page[Math.min(page.length, query.limit) - 1]!;
    const next =
      page.length > query.limit
        ? { t: lastRaw.created_at.toISOString(), id: lastRaw.message_id }
        : null;
    return {
      rows: slice.map(toRow),
      nextCursor: next,
    };
  }

  /** Существующие закладки пользователя на сообщения (идемпотентность add). */
  async findExisting(
    userId: string,
    messageIds: string[],
    tx?: TransactionClient,
  ): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const client = tx ?? this.prisma;
    const rows = await client.favorite.findMany({
      where: { userId, messageId: { in: messageIds } },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  /** Вставка одной закладки (PK user×message): true — вставлена, false — была. */
  async create(
    userId: string,
    messageId: string,
    createdAt: Date,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    try {
      await client.favorite.create({ data: { userId, messageId, createdAt } });
      return true;
    } catch (error) {
      // P2002 — дубль PK: звезда уже стоит (идемпотентность, дух ADR-0005).
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  async delete(userId: string, messageId: string, tx?: TransactionClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const removed = await client.favorite.deleteMany({
      where: { userId, messageId },
    });
    return removed.count > 0;
  }

  /** Удаление оригинала (#215): строки закладки гаснут у ВСЕХ владельцев
   *  (карточка-призрак не висит в витрине надгробием). Возвращает владельцев
   *  для событий FAVORITE_REMOVED в их user-комнаты. Атомарно (RETURNING). */
  async deleteByMessage(messageId: string, tx?: TransactionClient): Promise<string[]> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      DELETE FROM favorites WHERE message_id = ${messageId}::uuid RETURNING user_id
    `);
    return rows.map((row) => row.user_id);
  }

  async findRow(userId: string, messageId: string): Promise<FavoriteRow | null> {
    const record = await this.prisma.favorite.findUnique({
      where: { userId_messageId: { userId, messageId } },
      include: CARD_INCLUDE,
    });
    return record ? toRow(record) : null;
  }

  /** Правка меток; null — закладки нет. */
  async update(
    userId: string,
    messageId: string,
    data: { labels?: Prisma.InputJsonValue },
    tx?: TransactionClient,
  ): Promise<FavoriteRow | null> {
    const client = tx ?? this.prisma;
    try {
      const record = await client.favorite.update({
        where: { userId_messageId: { userId, messageId } },
        data,
        include: CARD_INCLUDE,
      });
      return toRow(record);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') return null;
      throw error;
    }
  }

  /** Существующие эмодзи-метки пользователя (чипы поиска): DISTINCT по всем
   *  закладкам, в алфавитном порядке. Prisma не разворачивает jsonb
   *  массивы — raw SQL (репозиторий — единственная точка Prisma, raw здесь). */
  async distinctLabels(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ label: string }[]>(Prisma.sql`
      SELECT DISTINCT e.label AS label
      FROM favorites f, jsonb_array_elements_text(f.labels) AS e(label)
      WHERE f.user_id = ${userId}::uuid
      ORDER BY label
    `);
    return rows.map((r) => r.label);
  }

  /** Источник агрегата «Избранного по чатам» (строка панели источников). */
  async sourceRows(
    userId: string,
  ): Promise<{ id: string; type: string; title: string | null; last: Date; count: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; type: string; title: string | null; last: Date; count: bigint }[]
    >(Prisma.sql`
      SELECT m.conversation_id AS id, c.type, c.title,
             MAX(f.created_at) AS last, COUNT(*) AS count
      FROM favorites f
      JOIN messages m ON m.id = f.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE f.user_id = ${userId}::uuid
        AND m.deleted_at IS NULL AND NOT m.obliterated
        AND EXISTS (
          SELECT 1 FROM conversation_members cm
          WHERE cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}::uuid
        )
      GROUP BY m.conversation_id, c.type, c.title
      ORDER BY MAX(f.created_at) DESC
    `);
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  /**
   * Сводка «Избранного» пользователя: счётчики категорий ПО КАРТОЧКАМ звёзд
   * (вложения живых оригиналов с mime-классификацией витрины + ссылки
   * message_links — НЕ stats беседы «Избранное»: избранное живёт в чужих
   * беседах, ревизия 05.10) и псевдоисточник «Записи». Одним SQL со scalar
   * subqueries — сводка панели, не горячий путь.
   */
  async sourcesSummary(userId: string): Promise<{
    counts: {
      image: number;
      video: number;
      audio: number;
      document: number;
      link: number;
    };
    notesCount: number;
    notesLast: Date | null;
  }> {
    const alive = Prisma.sql`m.deleted_at IS NULL AND NOT m.obliterated`;
    const membership = Prisma.sql`EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}::uuid
    )`;
    const favoriteAttachments = (filter: Prisma.Sql) => Prisma.sql`
      (SELECT COUNT(*) FROM favorites f
         JOIN messages m ON m.id = f.message_id
         JOIN message_attachments a ON a.message_id = m.id
         WHERE f.user_id = ${userId}::uuid AND ${alive} AND ${membership} AND ${filter}
      )`;
    const rows = await this.prisma.$queryRaw<
      {
        image_count: bigint;
        video_count: bigint;
        audio_count: bigint;
        document_count: bigint;
        link_count: bigint;
        notes_count: bigint;
        notes_last: Date | null;
      }[]
    >(Prisma.sql`
      SELECT
        ${favoriteAttachments(Prisma.sql`a.kind = 'image'`)} AS image_count,
        ${favoriteAttachments(Prisma.sql`a.kind = 'file' AND a.mime LIKE 'video/%'`)} AS video_count,
        ${favoriteAttachments(Prisma.sql`a.kind = 'file' AND a.mime LIKE 'audio/%'`)} AS audio_count,
        ${favoriteAttachments(
          Prisma.sql`a.kind = 'file' AND a.mime NOT LIKE 'video/%' AND a.mime NOT LIKE 'audio/%'`,
        )} AS document_count,
        (SELECT COUNT(*) FROM favorites f
           JOIN messages m ON m.id = f.message_id
           JOIN message_links l ON l.message_id = m.id
           WHERE f.user_id = ${userId}::uuid AND ${alive} AND ${membership}
        ) AS link_count,
        (SELECT COUNT(*) FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.type = 'direct' AND c.user_min = ${userId}::uuid AND c.user_max = ${userId}::uuid
             AND m.author_id = ${userId}::uuid AND m.deleted_at IS NULL AND NOT m.obliterated
        ) AS notes_count,
        (SELECT MAX(m.created_at) FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.type = 'direct' AND c.user_min = ${userId}::uuid AND c.user_max = ${userId}::uuid
             AND m.author_id = ${userId}::uuid AND m.deleted_at IS NULL AND NOT m.obliterated
        ) AS notes_last
    `);
    const row = rows[0];
    return {
      counts: {
        image: Number(row?.image_count ?? 0),
        video: Number(row?.video_count ?? 0),
        audio: Number(row?.audio_count ?? 0),
        document: Number(row?.document_count ?? 0),
        link: Number(row?.link_count ?? 0),
      },
      notesCount: Number(row?.notes_count ?? 0),
      notesLast: row?.notes_last ?? null,
    };
  }
}
