import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  type ConversationVaultPage,
  type ListConversationVaultQuery,
  type UserRef,
  type VaultCounts,
  type VaultItem,
} from '@nodus/contracts';

import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import { toAttachmentDto } from '../messages/message-dto.mapper.js';
import { VaultRepository } from './vault.repository.js';

/** Курсор витрины: seq сообщения + положение внутри него (sort_order
 *  вложения или position ссылки) — keyset (seq DESC, position ASC). */
const vaultCursorSchema = z.object({ s: z.number().int().positive(), o: z.number().int().min(0) });

/**
 * Витрина беседы (#211): серверные списки вложений/ссылок панели «О чате».
 * Доступ — только участник беседы (I8): не-участник и несуществующая беседа
 * одинаково 404 (канон модуля «не палить наличие»).
 */
@Injectable()
export class VaultService {
  constructor(
    private readonly repo: VaultRepository,
    private readonly conversations: ConversationsRepository,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
    private readonly signedUrls: SignedUrlService,
  ) {}

  /** Страница секции витрины + счётчики всех типов (сводка панели). */
  async list(
    userId: string,
    conversationId: string,
    query: ListConversationVaultQuery,
  ): Promise<ConversationVaultPage> {
    if (!(await this.conversations.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    const cursor = query.cursor
      ? (() => {
          const decoded = decodeCursor(query.cursor, vaultCursorSchema);
          return { s: BigInt(decoded.s), o: decoded.o };
        })()
      : null;
    const counts = await this.countsInternal(conversationId, query.threadRootId ?? null);

    if (query.type === 'link') {
      const { rows, hasMore } = await this.repo.listLinks(
        conversationId,
        { limit: query.limit, threadRootId: query.threadRootId ?? null },
        cursor,
      );
      const authors = await this.authorRefs(new Set(rows.map((row) => row.authorId)));
      const items: VaultItem[] = rows.map((row) => ({
        type: 'link' as const,
        messageId: row.messageId,
        conversationId: row.conversationId,
        threadRootId: row.threadRootId,
        author: this.authorRef(authors, row.authorId),
        createdAt: row.messageCreatedAt.toISOString(),
        url: row.url,
      }));
      return {
        items,
        nextCursor: hasMore ? encodeCursor(cursorFor(rows[rows.length - 1]!)) : null,
        counts,
      };
    }

    const kind = query.type;
    const { rows, hasMore } = await this.repo.listAttachments(
      conversationId,
      { kind, limit: query.limit, threadRootId: query.threadRootId ?? null },
      cursor,
    );
    const authors = await this.authorRefs(new Set(rows.map((row) => row.authorId)));
    const items: VaultItem[] = rows.map((row) => ({
      type: kind,
      messageId: row.messageId,
      conversationId,
      threadRootId: row.threadRootId,
      author: this.authorRef(authors, row.authorId),
      createdAt: row.messageCreatedAt.toISOString(),
      attachment: toAttachmentDto(row, this.signedUrls),
    }));
    return {
      items,
      nextCursor: hasMore ? encodeCursor(cursorFor(rows[rows.length - 1]!)) : null,
      counts,
    };
  }

  /** Счётчики категорий витрины (панель-профиль, реф Telegram): без скоупа —
   *  O(1) из stats, с тредом — на лету. */
  async counts(
    userId: string,
    conversationId: string,
    threadRootId: string | null,
  ): Promise<VaultCounts> {
    if (!(await this.conversations.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    return this.countsInternal(conversationId, threadRootId);
  }

  private countsInternal(
    conversationId: string,
    threadRootId: string | null,
  ): Promise<VaultCounts> {
    return threadRootId
      ? this.repo.threadCounts(conversationId, threadRootId)
      : this.repo.conversationCounts(conversationId);
  }

  /** Гидратация авторов через read-порт (ADR-0012, как в ленте сообщений). */
  private async authorRefs(ids: Set<string>): Promise<Map<string, UserRef>> {
    const map = new Map<string, UserRef>();
    if (ids.size === 0) return map;
    for (const ref of await this.userProfiles.findRefs([...ids])) map.set(ref.id, ref);
    return map;
  }

  /** Fallback профиля (паттерн message-dto.mapper): пользователя нет в
   *  справочнике — строка витрины всё равно собирается, без 500. */
  private authorRef(authors: Map<string, UserRef>, id: string): UserRef {
    return authors.get(id) ?? { id, displayName: 'Пользователь', avatarUrl: null };
  }
}

/** Курсор последней строки страницы: seq сообщения + sort_order вложения
 *  (или position ссылки). */
function cursorFor(last: { seq: bigint; sortOrder?: number; position?: number }): {
  s: number;
  o: number;
} {
  return { s: Number(last.seq), o: last.sortOrder ?? last.position ?? 0 };
}
