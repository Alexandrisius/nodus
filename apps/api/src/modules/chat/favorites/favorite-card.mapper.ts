import { Inject, Injectable } from '@nestjs/common';
import {
  favoriteLabelEmoji,
  type FavoriteCard,
  type MessageAttachment,
  type UserRef,
} from '@nodus/contracts';

import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import { toAttachmentDto } from '../messages/message-dto.mapper.js';
import { MessagesRepository } from '../messages/messages.repository.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import type { FavoriteRow } from './favorites.repository.js';

/** Fallback-профиль: пользователя нет в справочнике (крайний случай). */
function fallbackRef(id: string): UserRef {
  return { id, displayName: 'Пользователь', avatarUrl: null };
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

/** Эмодзи-метки из JSONB (записывались zod-схемой — на выдаче фильтруем мусор). */
export function parseLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.flatMap((item) => {
        const parsed = favoriteLabelEmoji.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ];
}

/**
 * Сборка карточки избранного (#171): контент — живая ссылка на оригинал
 * (значения на момент выдачи; надгробие — text=''/вложения пусты, автор
 * сохраняется — тон имени #180). Подпись источника: группы/каналы —
 * название, direct — имя собеседника, task/letter — null (фронт подставит
 * «Чат задачи»/«Чат письма» — i18n, I15).
 */
@Injectable()
export class FavoriteCardMapper {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly conversations: ConversationsRepository,
    private readonly signedUrls: SignedUrlService,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
  ) {}

  async toDtos(rows: FavoriteRow[], viewerId: string): Promise<FavoriteCard[]> {
    if (rows.length === 0) return [];
    const messageIds = rows.map((r) => r.messageId);

    const [attachments, directMembers] = await Promise.all([
      this.messages.attachmentsFor(messageIds),
      this.loadDirectMembers(rows),
    ]);
    const attachmentsByMessage = groupBy(attachments, (a) => a.messageId);

    // Профили: авторы оригиналов + собеседники direct-бесед (подпись «из …»).
    const refIds = new Set<string>(rows.map((r) => r.message.authorId));
    for (const members of directMembers.values()) {
      for (const m of members) {
        if (m.userId !== viewerId) refIds.add(m.userId);
      }
    }
    const refs = new Map<string, UserRef>();
    for (const ref of await this.userProfiles.findRefs([...refIds])) refs.set(ref.id, ref);

    return rows.map((row) => {
      const message = row.message;
      const tombstone = message.deletedAt !== null;
      const directMembersRow = directMembers.get(row.conversation.id);
      const other = directMembersRow?.find((m) => m.userId !== viewerId) ?? null;
      const directName = other ? (refs.get(other.userId)?.displayName ?? null) : null;
      return {
        messageId: row.messageId,
        conversationId: row.conversation.id,
        conversationTitle: row.conversation.title ?? directName,
        conversationType: row.conversation.type as FavoriteCard['conversationType'],
        threadRootId: message.threadRootId,
        author: refs.get(message.authorId) ?? fallbackRef(message.authorId),
        text: tombstone ? '' : message.text,
        attachments: tombstone
          ? []
          : (attachmentsByMessage.get(row.messageId) ?? []).map((a): MessageAttachment =>
              toAttachmentDto(a, this.signedUrls),
            ),
        editedAt: message.editedAt?.toISOString() ?? null,
        deletedAt: message.deletedAt?.toISOString() ?? null,
        obliterated: message.obliterated,
        createdAt: message.createdAt.toISOString(),
        labels: parseLabels(row.labels),
        favoritedAt: row.createdAt.toISOString(),
      };
    });
  }

  /** Участники direct-бесед карточек — имя собеседника для подписи источника. */
  private async loadDirectMembers(rows: FavoriteRow[]): Promise<Map<string, { userId: string }[]>> {
    const directIds = [
      ...new Set(
        rows.filter((r) => r.conversation.type === 'direct').map((r) => r.conversation.id),
      ),
    ];
    if (directIds.length === 0) return new Map();
    const members = await this.conversations.listMembers(directIds);
    const grouped = new Map<string, { userId: string }[]>();
    for (const m of members) {
      const list = grouped.get(m.conversationId) ?? [];
      list.push({ userId: m.userId });
      grouped.set(m.conversationId, list);
    }
    return grouped;
  }
}
