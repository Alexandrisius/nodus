import { Inject, Injectable } from '@nestjs/common';
import type { ConversationListItem, ConversationPermissions, UserRef } from '@nodus/contracts';

import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { parsePermissions } from '../permissions.js';
import { MessageDtoMapper } from '../messages/message-dto.mapper.js';
import type { MemberRow, ConversationListRow } from './conversations.repository.js';

export interface ConversationItemContext {
  viewerId: string;
  /** Участники этой беседы (превью, курсоры для readAt lastMessage). */
  members: MemberRow[];
  /** Профили участников (маппер доберёт недостающее сам). */
  refs?: Map<string, UserRef>;
}

/**
 * Сборка ConversationListItem: membersPreview = участники кроме зрителя
 * («Заметки» — сам зритель; UI использует длину как счётчик группы),
 * lastMessage — полным маппером сообщений, права — из матрицы беседы.
 */
@Injectable()
export class ConversationItemMapper {
  constructor(
    private readonly messageMapper: MessageDtoMapper,
    private readonly signedUrls: SignedUrlService,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
  ) {}

  async toItem(
    row: ConversationListRow,
    ctx: ConversationItemContext,
  ): Promise<ConversationListItem> {
    const [item] = await this.toItems([row], ctx);
    if (!item) throw new Error('toItem: empty page');
    return item;
  }

  /** Страница списка бесед (#124): lastMessage всех строк — ОДНИМ toDtos
   *  (6 батч-запросов на страницу вместо ~6 на строку; аудит #123: ~300
   *  запросов на GET /chat/conversations). Курсоры прочтения смешанной
   *  страницы — membersByConversation. */
  async toItems(
    rows: ConversationListRow[],
    ctx: ConversationItemContext,
  ): Promise<ConversationListItem[]> {
    const membersByConversation = new Map<string, MemberRow[]>();
    for (const row of rows) {
      membersByConversation.set(
        row.id,
        ctx.members.filter((m) => m.conversationId === row.id),
      );
    }
    const lastDtos = await this.messageMapper.toDtos(
      rows.filter((row) => row.lm_id !== null).map(rowToMessageRow),
      { viewerId: ctx.viewerId, members: ctx.members, membersByConversation },
    );
    const dtoById = new Map(lastDtos.map((dto) => [dto.id, dto]));
    const items: ConversationListItem[] = [];
    for (const row of rows) {
      const members = membersByConversation.get(row.id) ?? [];
      const preview = await this.membersPreview(row, members, ctx.viewerId, ctx.refs);
      const lastMessage = row.lm_id ? (dtoById.get(row.lm_id) ?? null) : null;
      items.push({
        id: row.id,
        type: row.type as ConversationListItem['type'],
        title: row.title,
        // Аватар — файл-дериват (#186): подписная ссылка отдачи files.
        avatarUrl: row.avatar_file_id ? this.signedUrls.fileContentUrl(row.avatar_file_id) : null,
        myRole: row.role as ConversationListItem['myRole'],
        permissions: parsePermissions(row.permissions) as ConversationPermissions,
        draft:
          row.draft_text !== null
            ? {
                text: row.draft_text,
                revision: row.draft_revision ?? 0,
                updatedAt: (row.draft_updated_at ?? new Date()).toISOString(),
              }
            : null,
        visibility: (row.visibility as ConversationListItem['visibility']) ?? null,
        description: row.description,
        project: null,
        task: null,
        letter: null,
        membersPreview: preview,
        // Всего участников, считая зрителя (#186): кнопка «N участников».
        membersCount: members.length,
        lastMessage,
        // Активность сортировки (#215): звезда в «Избранном» — как новое
        // сообщение; null — активности не было.
        lastActivityAt: row.last_activity_at?.toISOString() ?? null,
        unreadCount: row.unread_count,
        // Watermark текущего пользователя: якорь «первое непрочитанное» при
        // открытии беседы (раунд 3) — seq > myLastReadSeq.
        myLastReadSeq: Number(row.my_last_read_seq),
        pinned: row.pinned,
        muted: row.muted,
        snoozed: row.snoozed,
      });
    }
    return items;
  }

  private async membersPreview(
    row: ConversationListRow,
    members: MemberRow[],
    viewerId: string,
    preloaded?: Map<string, UserRef>,
  ): Promise<UserRef[]> {
    const otherIds = members.filter((m) => m.userId !== viewerId).map((m) => m.userId);
    // «Заметки» (direct с собой): превью — сам зритель (мок: определяющий признак).
    const ids = otherIds.length === 0 && row.type === 'direct' ? [viewerId] : otherIds;
    if (ids.length === 0) return [];
    const refs = new Map(preloaded ?? []);
    const toLoad = ids.filter((id) => !refs.has(id));
    if (toLoad.length > 0) {
      for (const ref of await this.userProfiles.findRefs(toLoad)) refs.set(ref.id, ref);
    }
    return ids.flatMap((id) => {
      const ref = refs.get(id);
      return ref ? [ref] : [];
    });
  }
}

/** lastMessage из «плоской» строки списка (lm_* колонки) → MessageRow. */
function rowToMessageRow(row: ConversationListRow): Parameters<MessageDtoMapper['toDto']>[0] {
  return {
    id: row.lm_id!,
    conversationId: row.id,
    seq: row.lm_seq!,
    authorId: row.lm_author_id!,
    clientMessageId: '',
    text: row.lm_text ?? '',
    urgent: row.lm_urgent ?? false,
    requireAck: row.lm_require_ack ?? false,
    mentionedUserIds: null,
    replyToId: row.lm_reply_to_id,
    replySnapshot: row.lm_reply_snapshot ?? null,
    threadRootId: row.lm_thread_root_id,
    fwdConversationId: row.lm_fwd_conversation_id,
    fwdMessageId: row.lm_fwd_message_id,
    fwdAuthorId: row.lm_fwd_author_id,
    fwdThreadRootId: row.lm_fwd_thread_root_id,
    editedAt: row.lm_edited_at,
    deletedAt: row.lm_deleted_at,
    obliterated: false,
    createdAt: row.lm_created_at!,
    updatedAt: row.lm_created_at!,
  };
}
