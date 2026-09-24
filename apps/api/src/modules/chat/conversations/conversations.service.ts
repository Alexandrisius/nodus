import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  CHAT_EVENTS,
  type ConversationDraft,
  type ConversationListItem,
  type CreateConversationBody,
  type ListConversationsQuery,
  type Paginated,
  type UserRef,
} from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { mergePermissions } from '../permissions.js';
import { ConversationItemMapper } from './conversation-item.mapper.js';
import {
  ConversationsRepository,
  type ConversationListCursor,
} from './conversations.repository.js';

const conversationCursorSchema = z.object({
  at: z.string().nullable(),
  id: z.string().uuid(),
});

/**
 * Беседы: список (LATERAL + unread одним запросом), создание групп/каналов,
 * find-or-create direct, персональные настройки списка, черновики.
 * Нечлен беседы и несуществующая беседа неотличимы (404 — не палить наличие).
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly repo: ConversationsRepository,
    private readonly items: ConversationItemMapper,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
  ) {}

  async list(
    userId: string,
    query: ListConversationsQuery,
  ): Promise<Paginated<ConversationListItem>> {
    let searchTitle: string | undefined;
    let searchUserIds: string[] | undefined;
    if (query.search) {
      // ILIKE-метасимволы экранируются (поиск «100%» не должен совпадать со всем).
      searchTitle = query.search.replace(/[%_]/g, (ch) => '\\' + ch);
      searchUserIds = (await this.userProfiles.searchByDisplayName(query.search, 100)).map(
        (ref) => ref.id,
      );
    }
    const cursor = query.cursor ? decodeCursor(query.cursor, conversationCursorSchema) : undefined;
    const rows = await this.repo.listForUser(userId, {
      limit: query.limit,
      cursor: cursor as ConversationListCursor | undefined,
      searchTitle,
      searchUserIds,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const members = await this.repo.listMembers(page.map((row) => row.id));
    const refs = await this.loadMemberRefs(members);
    const items = await Promise.all(
      page.map((row) => this.items.toItem(row, { viewerId: userId, members, refs })),
    );
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ at: last.last_message_at?.toISOString() ?? null, id: last.id })
          : null,
    };
  }

  /** Создание группы/канала: создатель owner, участники member (мок: без них). */
  async create(userId: string, body: CreateConversationBody): Promise<ConversationListItem> {
    const known = new Map(
      (await this.userProfiles.findRefs(body.memberIds ?? [])).map((r) => [r.id, r]),
    );
    const memberIds = [...new Set(body.memberIds ?? [])].filter(
      (id) => id !== userId && known.has(id),
    );
    const permissions = mergePermissions(body.permissions);
    const conversationId = await this.txRunner.run(async (tx) => {
      const id = await this.repo.createGroup(
        {
          type: body.type,
          title: body.title,
          description: body.description ?? null,
          visibility: body.visibility ?? 'closed',
          permissions,
          createdBy: userId,
          memberIds,
        },
        tx,
      );
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.CONVERSATION_CREATED,
        {
          conversationId: id,
          type: body.type,
          title: body.title,
          createdBy: userId,
          memberIds: [userId, ...memberIds],
        },
        { actorId: userId, aggregateType: 'conversation', aggregateId: id },
      );
      if (memberIds.length > 0) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MEMBER_ADDED,
          { conversationId: id, userIds: memberIds, role: 'member' },
          { actorId: userId, aggregateType: 'conversation', aggregateId: id },
        );
      }
      return id;
    });
    return this.getItemOrThrow(conversationId, userId);
  }

  /** Find-or-create direct (включая «Заметки» с собой); 404 — нет такого user. */
  async findOrCreateDirect(
    userId: string,
    peerId: string,
  ): Promise<{ item: ConversationListItem; created: boolean }> {
    if ((await this.userProfiles.findRefs([peerId])).length === 0) {
      throw DomainException.notFound('User not found');
    }
    const result = await this.txRunner.run(async (tx) => {
      const created = await this.repo.findOrCreateDirect(userId, peerId, tx);
      if (created.created) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.CONVERSATION_CREATED,
          {
            conversationId: created.id,
            type: 'direct',
            title: null,
            createdBy: userId,
            memberIds: [...new Set([userId, peerId])],
          },
          { actorId: userId, aggregateType: 'conversation', aggregateId: created.id },
        );
      }
      return created;
    });
    return { item: await this.getItemOrThrow(result.id, userId), created: result.created };
  }

  /** Персональные настройки (pinned/muted/snoozed/hidden) — только член. */
  async patch(
    userId: string,
    conversationId: string,
    patch: { pinned?: boolean; muted?: boolean; snoozed?: boolean; hidden?: boolean },
  ): Promise<ConversationListItem> {
    if (!(await this.repo.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    await this.repo.updateMemberSettings(conversationId, userId, patch);
    return this.getItemOrThrow(conversationId, userId);
  }

  /** PUT черновика: пустой текст = удаление; revision растит сервер (LWW). */
  async putDraft(
    userId: string,
    conversationId: string,
    text: string,
  ): Promise<ConversationDraft | null> {
    if (!(await this.repo.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    const draft = await this.repo.putDraft(conversationId, userId, text);
    return draft
      ? { text: draft.text, revision: draft.revision, updatedAt: draft.updatedAt.toISOString() }
      : null;
  }

  private async getItemOrThrow(
    conversationId: string,
    userId: string,
  ): Promise<ConversationListItem> {
    const row = await this.repo.findListItem(conversationId, userId);
    if (!row) throw DomainException.notFound('Conversation not found');
    const members = await this.repo.listMembers([conversationId]);
    return this.items.toItem(row, { viewerId: userId, members });
  }

  private async loadMemberRefs(members: { userId: string }[]): Promise<Map<string, UserRef>> {
    const ids = [...new Set(members.map((m) => m.userId))];
    const refs = new Map<string, UserRef>();
    for (const ref of await this.userProfiles.findRefs(ids)) refs.set(ref.id, ref);
    return refs;
  }
}
