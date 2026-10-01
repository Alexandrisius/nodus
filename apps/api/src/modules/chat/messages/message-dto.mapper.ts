import { Inject, Injectable } from '@nestjs/common';
import type {
  ChatMessage,
  MessageAttachment,
  MessageReaction,
  ReplyPreview,
  StickerMeta,
  UserRef,
} from '@nodus/contracts';

import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { MemberRow } from '../conversations/conversations.repository.js';
import { MessagesRepository, type MessageRow, type ReactionRow } from './messages.repository.js';
import { MessagePinsRepository } from './message-pins.repository.js';

/** Замороженный снапшот цитаты (поле reply_snapshot). */
export interface ReplySnapshotValue {
  authorId: string | null;
  text: string;
  quoteText: string | null;
  attachmentKind: 'image' | 'file' | 'sticker' | null;
}

/** userId упоминаний из JSONB-колонки (снапшот отправки, #100). */
export function readMentionedUserIds(row: MessageRow): string[] {
  const raw = (row.mentionedUserIds ?? null) as string[] | null;
  return Array.isArray(raw) ? raw : [];
}

/** Строка вложения для DTO (стикер дополнительно несёт снапшот пака). */
export interface AttachmentDtoRow {
  id: string;
  fileId: string;
  name: string;
  size: number;
  mime: string;
  kind: string;
  width: number | null;
  height: number | null;
  thumbFileId: string | null;
  stickerMeta?: unknown;
}

/** Сборка DTO вложения: подписанный url, вид по kind, снапшот стикера. */
function toAttachmentDto(a: AttachmentDtoRow, signedUrls: SignedUrlService): MessageAttachment {
  const stickerMeta = (a.stickerMeta as StickerMeta | null | undefined) ?? null;
  return {
    id: a.id,
    fileId: a.fileId,
    name: a.name,
    size: a.size,
    mime: a.mime,
    kind: a.kind as 'image' | 'file' | 'sticker',
    url: signedUrls.fileContentUrl(a.fileId),
    // Серверное превью-дериват (#150); null — не сгенерировано.
    thumbnailUrl: a.thumbFileId ? signedUrls.fileContentUrl(a.thumbFileId) : null,
    width: a.width,
    height: a.height,
    ...(a.kind === 'sticker' && stickerMeta ? { sticker: stickerMeta } : {}),
  };
}

export interface MessageDtoContext {
  viewerId: string;
  /** Участники беседы сообщения (курсоры прочтения для readAt). */
  members: MemberRow[];
  /** Смешанная страница (список бесед: lastMessage разных бесед одним
   *  toDtos, #124): курсоры прочтения берутся ПО СВОЕЙ беседе; нет записи —
   *  fallback на members. */
  membersByConversation?: ReadonlyMap<string, MemberRow[]>;
}

/** Курсоры прочтения строки: своя беседа в смешанной странице, иначе members. */
function membersFor(ctx: MessageDtoContext, conversationId: string): MemberRow[] {
  return ctx.membersByConversation?.get(conversationId) ?? ctx.members;
}

/** Fallback-профиль: пользователя нет в справочнике (крайний случай). */
function fallbackRef(id: string): UserRef {
  return { id, displayName: 'Пользователь', avatarUrl: null };
}

/**
 * Сборка ChatMessage DTO из сырых строк: гидратация авторов через read-порт
 * (ADR-0012), readAt по курсорам участников, реакции/вложения/счётчики треда
 * батчами. Надгробие: text='', вложения/реакции/цитата пусты (мок-семантика).
 */
@Injectable()
export class MessageDtoMapper {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly pins: MessagePinsRepository,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
    private readonly signedUrls: SignedUrlService,
  ) {}

  async toDtos(rows: MessageRow[], ctx: MessageDtoContext): Promise<ChatMessage[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const replyIds = [...new Set(rows.flatMap((r) => (r.replyToId ? [r.replyToId] : [])))];
    // Прочитавшие своих сообщений (#102): батч в общий loadRefs.
    const readByRows = rows.map((row) => ({
      row,
      readers: computeReadBy(row, membersFor(ctx, row.conversationId), ctx.viewerId),
    }));
    const readerIds = new Set(readByRows.flatMap(({ readers }) => readers.map((r) => r.userId)));
    // Реакции читаются ДО refs: их userId попадают в общий батч профилей
    // (тултип «кто поставил» — users в DTO, вердикт 27.09).
    const reactions = await this.messages.reactionsFor(ids);
    const reactionUserIds = new Set(reactions.map((r) => r.userId));
    const [refs, attachments, threadCounts, pinnedIds, replyOriginals] = await Promise.all([
      this.loadRefs(rows, readerIds, reactionUserIds),
      this.messages.attachmentsFor(ids),
      this.messages.threadReplyCounts(rows.filter((r) => r.threadRootId === null).map((r) => r.id)),
      this.pins.pinnedIds(ids),
      replyIds.length > 0 ? this.messages.findByIds(replyIds) : Promise.resolve([]),
    ]);

    const reactionsByMessage = groupBy(reactions, (r) => r.messageId);
    const attachmentsByMessage = groupBy(attachments, (a) => a.messageId);
    const threadCountByRoot = new Map(threadCounts.map((t) => [t.rootId, t.count]));
    const originalById = new Map(replyOriginals.map((o) => [o.id, o]));

    return rows.map((row, index) => {
      const tombstone = row.deletedAt !== null;
      const readers = readByRows[index]?.readers ?? [];
      return {
        id: row.id,
        conversationId: row.conversationId,
        seq: Number(row.seq),
        author: refs.get(row.authorId) ?? fallbackRef(row.authorId),
        text: tombstone ? '' : row.text,
        replyToId: row.replyToId,
        reply: tombstone ? null : buildReplyPreview(row, refs, originalById),
        threadRootId: row.threadRootId,
        threadRepliesCount: row.threadRootId === null ? (threadCountByRoot.get(row.id) ?? 0) : 0,
        reactions: tombstone
          ? []
          : groupReactions(reactionsByMessage.get(row.id) ?? [], ctx.viewerId, refs),
        attachments: tombstone
          ? []
          : (attachmentsByMessage.get(row.id) ?? []).map((a): MessageAttachment =>
              toAttachmentDto(a, this.signedUrls),
            ),
        editedAt: row.editedAt?.toISOString() ?? null,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        pinned: pinnedIds.has(row.id),
        forwardedFrom: buildForwardedFrom(row, refs),
        readAt: computeReadAt(row, membersFor(ctx, row.conversationId), ctx.viewerId),
        readBy: readers.map(
          (reader): UserRef => refs.get(reader.userId) ?? fallbackRef(reader.userId),
        ),
        urgent: row.urgent,
        mentionedUserIds: tombstone ? [] : readMentionedUserIds(row),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async toDto(row: MessageRow, ctx: MessageDtoContext): Promise<ChatMessage> {
    const [dto] = await this.toDtos([row], ctx);
    if (!dto) throw new Error('toDto: empty page');
    return dto;
  }

  /**
   * DTO ТОЛЬКО ЧТО вставленного сообщения (payload события message_sent,
   * раунд 3 — «буря рефечей»): живые клиенты применяют его в кэш локально по
   * seq. Собирается из данных транзакции отправки БЕЗ лишних запросов:
   * реакции/закрепы/прочитавшие у новой строки невозможны (пусты), вложения
   * переданы уже привязанными (claimAttachments). replyOriginal — строка
   * оригинала цитаты, уже загруженная отправкой (null — оригинал утрачен).
   * Профили читаются по соединению транзакции (tx) — иначе параллельные
   * отправки голодают пул соединений (repro chat-reliability).
   */
  async toFreshDto(
    row: MessageRow,
    ctx: {
      viewerId: string;
      members: MemberRow[];
      replyOriginal: MessageRow | null;
      attachments: AttachmentDtoRow[];
      tx?: TransactionClient;
    },
  ): Promise<ChatMessage> {
    const ids = new Set<string>([row.authorId]);
    const snapshot = (row.replySnapshot ?? null) as ReplySnapshotValue | null;
    if (snapshot?.authorId) ids.add(snapshot.authorId);
    if (row.fwdAuthorId) ids.add(row.fwdAuthorId);
    const refs = new Map<string, UserRef>();
    for (const ref of await this.userProfiles.findRefs([...ids], ctx.tx)) refs.set(ref.id, ref);

    const originalById = row.replyToId
      ? new Map(ctx.replyOriginal ? [[ctx.replyOriginal.id, ctx.replyOriginal]] : [])
      : new Map<string, MessageRow>();
    return {
      id: row.id,
      conversationId: row.conversationId,
      seq: Number(row.seq),
      author: refs.get(row.authorId) ?? fallbackRef(row.authorId),
      text: row.text,
      replyToId: row.replyToId,
      reply: buildReplyPreview(row, refs, originalById),
      threadRootId: row.threadRootId,
      threadRepliesCount: 0,
      reactions: [],
      attachments: ctx.attachments.map((a) => toAttachmentDto(a, this.signedUrls)),
      editedAt: null,
      deletedAt: null,
      pinned: false,
      forwardedFrom: buildForwardedFrom(row, refs),
      readAt: computeReadAt(row, ctx.members, ctx.viewerId),
      readBy: [],
      urgent: row.urgent,
      mentionedUserIds: readMentionedUserIds(row),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadRefs(
    rows: MessageRow[],
    readerIds: Set<string> = new Set(),
    extraIds: Set<string> = new Set(),
  ): Promise<Map<string, UserRef>> {
    const ids = new Set<string>([...readerIds, ...extraIds]);
    for (const row of rows) {
      ids.add(row.authorId);
      const snapshot = (row.replySnapshot ?? null) as ReplySnapshotValue | null;
      if (snapshot?.authorId) ids.add(snapshot.authorId);
      if (row.fwdAuthorId) ids.add(row.fwdAuthorId);
    }
    const refs = new Map<string, UserRef>();
    const loaded = await this.userProfiles.findRefs([...ids]);
    for (const ref of loaded) refs.set(ref.id, ref);
    return refs;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

function groupReactions(
  rows: ReactionRow[],
  viewerId: string,
  refs: Map<string, UserRef>,
): MessageReaction[] {
  const byEmoji = new Map<string, { users: UserRef[]; mine: boolean }>();
  for (const { emoji, userId } of rows) {
    const agg = byEmoji.get(emoji) ?? { users: [], mine: false };
    agg.users.push(refs.get(userId) ?? fallbackRef(userId));
    agg.mine = agg.mine || userId === viewerId;
    byEmoji.set(emoji, agg);
  }
  return [...byEmoji.entries()]
    .map(([emoji, { users, mine }]) => ({ emoji, count: users.length, mine, users }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

/**
 * Цитата: текст/quoteText/attachmentKind заморожены в снапшоте на момент
 * отправки (правка оригинала не меняет — вердикт 24.09); удалённость
 * оригинала вычисляется по строке (удаление сильнее заморозки). Строки
 * оригиналов не удаляются физически (obliterated остаётся в БД) — автор
 * цитаты известен всегда из замороженного снапшота; null возможен только
 * у legacy-снапшотов без автора.
 */
function buildReplyPreview(
  row: MessageRow,
  refs: Map<string, UserRef>,
  originalById: Map<string, MessageRow>,
): ReplyPreview | null {
  if (!row.replyToId) return null;
  const snapshot = (row.replySnapshot ?? null) as ReplySnapshotValue | null;
  const original = originalById.get(row.replyToId);
  const deleted = original === undefined || original.deletedAt !== null;
  // #163: obliterated-оригинала в ленте нет — клику по цитате некуда вести;
  // deleted при надгробии (obliterated=false) — цитата кликабельна.
  const obliterated = original === undefined || original.obliterated;
  const authorId = snapshot?.authorId ?? original?.authorId ?? null;
  return {
    id: row.replyToId,
    author: authorId === null ? null : (refs.get(authorId) ?? fallbackRef(authorId)),
    text: deleted ? '' : (snapshot?.text ?? original?.text.slice(0, 160) ?? ''),
    quoteText: deleted ? null : (snapshot?.quoteText ?? null),
    attachmentKind: deleted ? null : (snapshot?.attachmentKind ?? null),
    deleted,
    obliterated,
  };
}

function buildForwardedFrom(
  row: MessageRow,
  refs: Map<string, UserRef>,
): ChatMessage['forwardedFrom'] {
  if (!row.fwdMessageId || !row.fwdAuthorId || !row.fwdConversationId) return null;
  return {
    author: refs.get(row.fwdAuthorId) ?? fallbackRef(row.fwdAuthorId),
    conversationId: row.fwdConversationId,
    messageId: row.fwdMessageId,
    threadRootId: row.fwdThreadRootId,
  };
}

/**
 * Прочитанность СВОИХ сообщений (модель Битрикс24/Telegram, #102): прочитавшим
 * считается участник с lastReadSeq >= seq, прочитавший ПОСЛЕ правки
 * (editedAt; «повторный пуш прочитавшим», решение #41). readAt — момент
 * ПЕРВОГО прочитавшего (min; в direct он единственный); readBy — все
 * прочитавшие на момент выдачи, по времени прочтения. Для чужих сообщений
 * readAt=null, readBy=[] (прочитавших видит только автор).
 */
export function computeReadAt(
  row: Pick<MessageRow, 'authorId' | 'seq' | 'editedAt' | 'createdAt'>,
  members: MemberRow[],
  viewerId: string,
): string | null {
  if (row.authorId !== viewerId) return null;
  if (!members.some((m) => m.userId !== row.authorId)) {
    return row.createdAt.toISOString(); // «Заметки» (одиночная беседа)
  }
  let firstReaderAt: Date | null = null;
  for (const reader of readCursors(row, members)) {
    if (firstReaderAt === null || reader.lastReadAt < firstReaderAt) {
      firstReaderAt = reader.lastReadAt;
    }
  }
  return firstReaderAt?.toISOString() ?? null;
}

/** Прочитавшие своё сообщение (userId по возрастанию времени прочтения). */
export function computeReadBy(
  row: Pick<MessageRow, 'authorId' | 'seq' | 'editedAt'>,
  members: MemberRow[],
  viewerId: string,
): { userId: string; lastReadAt: Date }[] {
  if (row.authorId !== viewerId) return [];
  return readCursors(row, members).sort((a, b) => a.lastReadAt.getTime() - b.lastReadAt.getTime());
}

function readCursors(
  row: Pick<MessageRow, 'authorId' | 'seq' | 'editedAt'>,
  members: MemberRow[],
): { userId: string; lastReadAt: Date }[] {
  const readers: { userId: string; lastReadAt: Date }[] = [];
  for (const other of members) {
    if (other.userId === row.authorId) continue;
    const readCurrent = other.lastReadSeq >= row.seq;
    const readAfterEdit =
      row.editedAt === null || (other.lastReadAt !== null && other.lastReadAt >= row.editedAt);
    if (readCurrent && readAfterEdit && other.lastReadAt !== null) {
      readers.push({ userId: other.userId, lastReadAt: other.lastReadAt });
    }
  }
  return readers;
}
