import { Injectable } from '@nestjs/common';
import type { VaultCounts } from '@nodus/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { extractMessageUrls } from '../messages/link-extractor.js';
import type { AttachmentDtoRow } from '../messages/message-dto.mapper.js';

/** Витрина беседы (#211): списки вложений/ссылок + денормализованные
 *  счётчики (conversation_vault_stats) и проекция ссылок (message_links).
 *
 *  Производительность (модель Telegram getSearchCounters / Битрикс24):
 *  счётчики всей беседы — чтение O(1) по PK stats-строки (Δ-обслуживание
 *  в транзакциях состава — см. messages.service/message-actions.service);
 *  списки — keyset (seq DESC, положение в сообщении ASC) по индексам
 *  messages(conversation_id, seq) и message_links(conversation_id).
 *  Счётчики скоупа треда считаются на лету (объём треда мал; денормализацию
 *  per-thread не плодим). Инвариант stats == COUNT(живых) проверяется
 *  integration-тестами; полный пересчёт — миграция vault_backfill. */

/** Δ счётчиков одной операции состава (0 — не трогать). */
export interface VaultDelta {
  image: number;
  video: number;
  audio: number;
  document: number;
  link: number;
}

export function emptyVaultDelta(): VaultDelta {
  return { image: 0, video: 0, audio: 0, document: 0, link: 0 };
}

/** Δ состава без ссылок (ссылки считает проекция). */
export type VaultAttachmentDelta = Omit<VaultDelta, 'link'>;

export function emptyAttachmentDelta(): VaultAttachmentDelta {
  return { image: 0, video: 0, audio: 0, document: 0 };
}

/**
 * Витринная категория вложения (ревизия 05.10 — модель Telegram):
 * kind='image' → image, файлы — по mime (video/*, audio/*), остальное —
 * document. Это классификация ВИТРИНЫ: storage-kind в БД не меняется
 * (image|file|sticker); стикеры — не пользовательские файлы, null.
 */
export type VaultKind = 'image' | 'video' | 'audio' | 'document';
export function vaultKindOf(mime: string, kind: string): VaultKind | null {
  if (kind === 'image') return 'image';
  if (kind === 'sticker') return null;
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return kind === 'file' ? 'document' : null;
}

/** Δ счётчиков по составам вложений ДО/ПОСЛЕ (правка #188): стикеры и
 *  посторонние виды не участвуют. */
export function attachmentKindDelta(
  before: readonly { kind: string; mime: string }[],
  after: readonly { kind: string; mime: string }[],
): VaultAttachmentDelta {
  const tally = (rows: readonly { kind: string; mime: string }[]) => {
    const acc = emptyAttachmentDelta();
    for (const a of rows) {
      const kind = vaultKindOf(a.mime, a.kind);
      if (kind) acc[kind] += 1;
    }
    return acc;
  };
  const beforeTally = tally(before);
  const afterTally = tally(after);
  return {
    image: afterTally.image - beforeTally.image,
    video: afterTally.video - beforeTally.video,
    audio: afterTally.audio - beforeTally.audio,
    document: afterTally.document - beforeTally.document,
  };
}

/** Контекст сообщения для вставки строк message_links. */
export interface LinkMessageContext {
  id: string;
  conversationId: string;
  threadRootId: string | null;
  authorId: string;
  createdAt: Date;
}

/** Строка вложения витрины: DTO-поля + контекст сообщения-источника. */
export interface VaultAttachmentRow extends AttachmentDtoRow {
  sortOrder: number;
  messageId: string;
  threadRootId: string | null;
  seq: bigint;
  authorId: string;
  messageCreatedAt: Date;
}

/** Строка ссылки витрины (message_links + seq сообщения для keyset). */
export interface VaultLinkRow {
  messageId: string;
  conversationId: string;
  threadRootId: string | null;
  position: number;
  url: string;
  authorId: string;
  seq: bigint;
  messageCreatedAt: Date;
}

const ATTACHMENT_COLS = Prisma.sql`
  a.id, a.file_id AS "fileId", a.name, a.size, a.mime, a.kind,
  a.width, a.height, a.thumb_file_id AS "thumbFileId", a.sort_order AS "sortOrder",
  m.id AS "messageId", m.thread_root_id AS "threadRootId", m.seq,
  m.author_id AS "authorId", m.created_at AS "messageCreatedAt"
`;

const LINK_COLS = Prisma.sql`
  l.message_id AS "messageId", l.conversation_id AS "conversationId",
  l.thread_root_id AS "threadRootId", l.position, l.url, l.author_id AS "authorId",
  m.seq, m.created_at AS "messageCreatedAt"
`;

/** Живость сообщения-хоста (надгробия/бесследие в витрине не показываются). */

@Injectable()
export class VaultRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient): PrismaService | TransactionClient {
    return tx ?? this.prisma;
  }

  // ===== Чтение: списки =====

  /**
   * Страница вложений одной категории витрины: новые сверху, keyset
   * (seq DESC, sort_order ASC); hasMore по limit+1. Видео/аудио — файлы
   * с соответствующим mime (классификация vaultKindOf).
   */
  async listAttachments(
    conversationId: string,
    opts: { kind: VaultKind; limit: number; threadRootId: string | null },
    cursor: { s: bigint; o: number } | null,
  ): Promise<{ rows: VaultAttachmentRow[]; hasMore: boolean }> {
    const beforeSeq = cursor ? cursor.s.toString() : null;
    const beforeOrder = cursor ? cursor.o : 0;
    const thread = opts.threadRootId;
    const kindFilter =
      opts.kind === 'image'
        ? Prisma.sql`a.kind = 'image'`
        : opts.kind === 'video'
          ? Prisma.sql`a.kind = 'file' AND a.mime LIKE 'video/%'`
          : opts.kind === 'audio'
            ? Prisma.sql`a.kind = 'file' AND a.mime LIKE 'audio/%'`
            : Prisma.sql`a.kind = 'file' AND a.mime NOT LIKE 'video/%' AND a.mime NOT LIKE 'audio/%'`;
    const rows = await this.prisma.$queryRaw<VaultAttachmentRow[]>(Prisma.sql`
      SELECT ${ATTACHMENT_COLS} FROM message_attachments a
      JOIN messages m ON m.id = a.message_id
      WHERE m.conversation_id = ${conversationId}::uuid
        AND ${kindFilter}
        AND m.deleted_at IS NULL AND NOT m.obliterated
        AND (${thread === null} OR m.thread_root_id = ${thread ?? '00000000-0000-0000-0000-000000000000'}::uuid
             OR m.id = ${thread ?? '00000000-0000-0000-0000-000000000000'}::uuid)
        AND (${cursor === null}
             OR m.seq < ${beforeSeq ?? '0'}::bigint
             OR (m.seq = ${beforeSeq ?? '0'}::bigint AND a.sort_order > ${beforeOrder}::int))
      ORDER BY m.seq DESC, a.sort_order ASC
      LIMIT ${opts.limit + 1}
    `);
    const hasMore = rows.length > opts.limit;
    return { rows: hasMore ? rows.slice(0, opts.limit) : rows, hasMore };
  }

  /** Страница ссылок: новые сверху, keyset (seq DESC, position ASC). */
  async listLinks(
    conversationId: string,
    opts: { limit: number; threadRootId: string | null },
    cursor: { s: bigint; o: number } | null,
  ): Promise<{ rows: VaultLinkRow[]; hasMore: boolean }> {
    const beforeSeq = cursor ? cursor.s.toString() : null;
    const beforePosition = cursor ? cursor.o : 0;
    const thread = opts.threadRootId;
    const rows = await this.prisma.$queryRaw<VaultLinkRow[]>(Prisma.sql`
      SELECT ${LINK_COLS} FROM message_links l
      JOIN messages m ON m.id = l.message_id
      WHERE l.conversation_id = ${conversationId}::uuid
        AND m.deleted_at IS NULL AND NOT m.obliterated
        AND (${thread === null} OR l.thread_root_id = ${thread ?? '00000000-0000-0000-0000-000000000000'}::uuid
             OR l.message_id = ${thread ?? '00000000-0000-0000-0000-000000000000'}::uuid)
        AND (${cursor === null}
             OR m.seq < ${beforeSeq ?? '0'}::bigint
             OR (m.seq = ${beforeSeq ?? '0'}::bigint AND l.position > ${beforePosition}::int))
      ORDER BY m.seq DESC, l.position ASC
      LIMIT ${opts.limit + 1}
    `);
    const hasMore = rows.length > opts.limit;
    return { rows: hasMore ? rows.slice(0, opts.limit) : rows, hasMore };
  }

  // ===== Чтение: счётчики =====

  /** Счётчики всей беседы — O(1) из денормализованной stats-строки. */
  async conversationCounts(conversationId: string): Promise<VaultCounts> {
    const rows = await this.prisma.$queryRaw<
      {
        image_count: bigint;
        video_count: bigint;
        audio_count: bigint;
        document_count: bigint;
        link_count: bigint;
      }[]
    >(Prisma.sql`
      SELECT COALESCE(image_count, 0) AS image_count,
             COALESCE(video_count, 0) AS video_count,
             COALESCE(audio_count, 0) AS audio_count,
             COALESCE(document_count, 0) AS document_count,
             COALESCE(link_count, 0) AS link_count
      FROM conversation_vault_stats WHERE conversation_id = ${conversationId}::uuid
    `);
    return {
      image: Number(rows[0]?.image_count ?? 0),
      video: Number(rows[0]?.video_count ?? 0),
      audio: Number(rows[0]?.audio_count ?? 0),
      document: Number(rows[0]?.document_count ?? 0),
      link: Number(rows[0]?.link_count ?? 0),
    };
  }

  /**
   * Счётчики скоупа треда — на лету (объём треда мал; per-thread
   * денормализацию не плодим). Вложения и ссылки — join живых сообщений
   * треда (defense-in-depth: выдача не зависит от чистки проекции).
   */
  async threadCounts(conversationId: string, threadRootId: string): Promise<VaultCounts> {
    const threadScope = Prisma.sql`m.thread_root_id = ${threadRootId}::uuid OR m.id = ${threadRootId}::uuid`;
    const rows = await this.prisma.$queryRaw<
      {
        image_count: bigint;
        video_count: bigint;
        audio_count: bigint;
        document_count: bigint;
        link_count: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM message_attachments a
          JOIN messages m ON m.id = a.message_id
          WHERE m.conversation_id = ${conversationId}::uuid
            AND (${threadScope})
            AND m.deleted_at IS NULL AND NOT m.obliterated AND a.kind = 'image') AS image_count,
        (SELECT COUNT(*) FROM message_attachments a
          JOIN messages m ON m.id = a.message_id
          WHERE m.conversation_id = ${conversationId}::uuid
            AND (${threadScope})
            AND m.deleted_at IS NULL AND NOT m.obliterated
            AND a.kind = 'file' AND a.mime LIKE 'video/%') AS video_count,
        (SELECT COUNT(*) FROM message_attachments a
          JOIN messages m ON m.id = a.message_id
          WHERE m.conversation_id = ${conversationId}::uuid
            AND (${threadScope})
            AND m.deleted_at IS NULL AND NOT m.obliterated
            AND a.kind = 'file' AND a.mime LIKE 'audio/%') AS audio_count,
        (SELECT COUNT(*) FROM message_attachments a
          JOIN messages m ON m.id = a.message_id
          WHERE m.conversation_id = ${conversationId}::uuid
            AND (${threadScope})
            AND m.deleted_at IS NULL AND NOT m.obliterated AND a.kind = 'file'
            AND a.mime NOT LIKE 'video/%' AND a.mime NOT LIKE 'audio/%') AS document_count,
        (SELECT COUNT(*) FROM message_links l
          JOIN messages m ON m.id = l.message_id
          WHERE l.conversation_id = ${conversationId}::uuid
            AND (l.thread_root_id = ${threadRootId}::uuid OR l.message_id = ${threadRootId}::uuid)
            AND m.deleted_at IS NULL AND NOT m.obliterated) AS link_count
    `);
    return {
      image: Number(rows[0]?.image_count ?? 0),
      video: Number(rows[0]?.video_count ?? 0),
      audio: Number(rows[0]?.audio_count ?? 0),
      document: Number(rows[0]?.document_count ?? 0),
      link: Number(rows[0]?.link_count ?? 0),
    };
  }

  // ===== Обслуживание проекции ссылок (те же транзакции, что и состав) =====

  /** Вставка ссылок нового сообщения + Δ link-счётчика. */
  async insertLinks(
    tx: TransactionClient,
    message: LinkMessageContext,
    urls: string[],
  ): Promise<number> {
    if (urls.length === 0) return 0;
    await tx.messageLink.createMany({
      data: urls.map((url, position) => ({
        messageId: message.id,
        conversationId: message.conversationId,
        threadRootId: message.threadRootId,
        position,
        url,
        authorId: message.authorId,
        createdAt: message.createdAt,
      })),
    });
    return urls.length;
  }

  /**
   * Правка текста: полная замена строк ссылок сообщения (позиции
   * пересчитываются), Δ = new − old. Возвращает Δ для stats.
   */
  async replaceLinks(
    tx: TransactionClient,
    message: LinkMessageContext,
    urls: string[],
  ): Promise<number> {
    const removed = await tx.messageLink.deleteMany({ where: { messageId: message.id } });
    const added = urls.length;
    if (added > 0) {
      await tx.messageLink.createMany({
        data: urls.map((url, position) => ({
          messageId: message.id,
          conversationId: message.conversationId,
          threadRootId: message.threadRootId,
          position,
          url,
          authorId: message.authorId,
          createdAt: message.createdAt,
        })),
      });
    }
    return added - removed.count;
  }

  /** Удаление сообщения: чистка строк ссылок, возвращает их число (Δ −). */
  async deleteLinksByMessage(tx: TransactionClient, messageId: string): Promise<number> {
    const removed = await tx.messageLink.deleteMany({ where: { messageId } });
    return removed.count;
  }

  // ===== Обслуживание счётчиков =====

  /**
   * Применение Δ к stats-строке беседы (атомарный upsert-инкремент;
   * statement-level — по одному UPDATE на операцию, не на строку: паттерн
   * PostgreSQL counter cache без row-триггеров). Нулевая Δ — no-op.
   */
  async applyDelta(
    tx: TransactionClient,
    conversationId: string,
    delta: VaultDelta,
  ): Promise<void> {
    if (
      delta.image === 0 &&
      delta.video === 0 &&
      delta.audio === 0 &&
      delta.document === 0 &&
      delta.link === 0
    )
      return;
    await tx.$executeRaw`
      INSERT INTO conversation_vault_stats
        (conversation_id, image_count, video_count, audio_count, document_count, link_count)
      VALUES (${conversationId}::uuid, ${delta.image}::int, ${delta.video}::int,
              ${delta.audio}::int, ${delta.document}::int, ${delta.link}::int)
      ON CONFLICT (conversation_id) DO UPDATE SET
        image_count = conversation_vault_stats.image_count + EXCLUDED.image_count,
        video_count = conversation_vault_stats.video_count + EXCLUDED.video_count,
        audio_count = conversation_vault_stats.audio_count + EXCLUDED.audio_count,
        document_count = conversation_vault_stats.document_count + EXCLUDED.document_count,
        link_count = conversation_vault_stats.link_count + EXCLUDED.link_count
    `;
  }

  /** Живые вложения сообщений по витринным категориям (mime-классификация),
   *  сгруппированные по сообщению (Δ копий forward, Δ удаления). */
  async attachmentKindsByMessages(
    tx: TransactionClient,
    messageIds: string[],
  ): Promise<Map<string, VaultAttachmentDelta>> {
    const result = new Map<string, VaultAttachmentDelta>();
    if (messageIds.length === 0) return result;
    const rows = await tx.$queryRaw<
      {
        message_id: string;
        image: bigint;
        video: bigint;
        audio: bigint;
        document: bigint;
      }[]
    >(Prisma.sql`
      SELECT message_id,
        COUNT(*) FILTER (WHERE kind = 'image') AS image,
        COUNT(*) FILTER (WHERE kind = 'file' AND mime LIKE 'video/%') AS video,
        COUNT(*) FILTER (WHERE kind = 'file' AND mime LIKE 'audio/%') AS audio,
        COUNT(*) FILTER (WHERE kind = 'file'
          AND mime NOT LIKE 'video/%' AND mime NOT LIKE 'audio/%') AS document
      FROM message_attachments
      WHERE message_id = ANY(${messageIds}::uuid[]) AND kind IN ('image', 'file')
      GROUP BY message_id
    `);
    for (const row of rows) {
      result.set(row.message_id, {
        image: Number(row.image),
        video: Number(row.video),
        audio: Number(row.audio),
        document: Number(row.document),
      });
    }
    return result;
  }

  // ===== Операции жизненного цикла сообщения (вызовы из транзакций
  // send/edit/delete/forward — держат проекцию и счётчики консистентными) =====

  /** Отправка: строки ссылок нового текста + Δ по составу вложений. */
  async applyMessageSent(
    tx: TransactionClient,
    message: LinkMessageContext,
    attachments: readonly { kind: string; mime: string }[],
    text: string,
  ): Promise<void> {
    const delta = emptyVaultDelta();
    for (const attachment of attachments) {
      const kind = vaultKindOf(attachment.mime, attachment.kind);
      if (kind) delta[kind] += 1;
    }
    delta.link = await this.insertLinks(tx, message, extractMessageUrls(text));
    await this.applyDelta(tx, message.conversationId, delta);
  }

  /** Удаление (надгробие/бесследно): чистка ссылок + Δ по живому составу. */
  async applyMessageDeleted(
    tx: TransactionClient,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const removedLinks = await this.deleteLinksByMessage(tx, messageId);
    const kinds =
      (await this.attachmentKindsByMessages(tx, [messageId])).get(messageId) ??
      emptyAttachmentDelta();
    await this.applyDelta(tx, conversationId, {
      image: -kinds.image,
      video: -kinds.video,
      audio: -kinds.audio,
      document: -kinds.document,
      link: -removedLinks,
    });
  }

  /** Правка: замена строк ссылок (при смене текста) + Δ состава вложений. */
  async applyMessageEdited(
    tx: TransactionClient,
    message: LinkMessageContext & { text: string },
    body: { text: string },
    change: { changed: boolean; delta: VaultAttachmentDelta },
  ): Promise<void> {
    const textChanged = message.text !== body.text;
    const linkDelta = textChanged
      ? await this.replaceLinks(tx, message, extractMessageUrls(body.text))
      : 0;
    await this.applyDelta(tx, message.conversationId, { ...change.delta, link: linkDelta });
  }

  /** Пересылка: копии несут текст (ссылки — в проекцию) и категории вложений
   *  оригиналов (комментарий-строка — без sourceId, только её ссылки). */
  async applyForwardCopies(
    tx: TransactionClient,
    conversationId: string,
    copies: readonly { message: LinkMessageContext; text: string; sourceId?: string }[],
  ): Promise<void> {
    const sourceKinds = await this.attachmentKindsByMessages(
      tx,
      copies.flatMap((copy) => (copy.sourceId ? [copy.sourceId] : [])),
    );
    const delta = emptyVaultDelta();
    for (const copy of copies) {
      const kinds = copy.sourceId ? sourceKinds.get(copy.sourceId) : undefined;
      if (kinds) {
        delta.image += kinds.image;
        delta.video += kinds.video;
        delta.audio += kinds.audio;
        delta.document += kinds.document;
      }
      delta.link += await this.insertLinks(tx, copy.message, extractMessageUrls(copy.text));
    }
    await this.applyDelta(tx, conversationId, delta);
  }
}
