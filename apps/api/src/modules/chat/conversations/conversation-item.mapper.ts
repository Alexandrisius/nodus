import { Inject, Injectable } from '@nestjs/common';
import type { ConversationListItem, ConversationPermissions, UserRef } from '@nodus/contracts';

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
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
  ) {}

  async toItem(
    row: ConversationListRow,
    ctx: ConversationItemContext,
  ): Promise<ConversationListItem> {
    const members = ctx.members.filter((m) => m.conversationId === row.id);
    const preview = await this.membersPreview(row, members, ctx.viewerId, ctx.refs);
    const lastMessageRow = row.lm_id ? rowToMessageRow(row) : null;
    const lastMessage = lastMessageRow
      ? await this.messageMapper.toDto(lastMessageRow, { viewerId: ctx.viewerId, members })
      : null;
    return {
      id: row.id,
      type: row.type as ConversationListItem['type'],
      title: row.title,
      avatarUrl: null,
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
      lastMessage,
      unreadCount: row.unread_count,
      // Watermark текущего пользователя: якорь «первое непрочитанное» при
      // открытии беседы (раунд 3) — seq > myLastReadSeq.
      myLastReadSeq: Number(row.my_last_read_seq),
      pinned: row.pinned,
      muted: row.muted,
      snoozed: row.snoozed,
    };
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
