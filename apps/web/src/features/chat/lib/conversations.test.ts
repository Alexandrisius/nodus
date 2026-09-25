import { describe, expect, it } from 'vitest';
import type { ConversationListItem } from '@nodus/contracts';

import { sortByActivity } from './conversations.js';
import { canPostFeed } from '../../../shared/chat/conversations.js';

function conv(id: string, at: string | null, pinned = false): ConversationListItem {
  return {
    id,
    type: 'direct',
    title: id,
    avatarUrl: null,
    myRole: 'member',
    permissions: {
      changeInfo: 'admin',
      addMembers: 'member',
      removeMembers: 'admin',
      post: 'member',
      manageSettings: 'owner',
    },
    draft: null,
    visibility: null,
    description: null,
    project: null,
    task: null,
    letter: null,
    membersPreview: [],
    lastMessage: at
      ? {
          id: `m-${id}`,
          conversationId: id,
          seq: 1,
          author: { id: 'u', displayName: 'U', avatarUrl: null },
          text: 'x',
          replyToId: null,
          reply: null,
          deletedAt: null,
          pinned: false,
          forwardedFrom: null,
          threadRootId: null,
          threadRepliesCount: 0,
          reactions: [],
          attachments: [],
          editedAt: null,
          readAt: null,
          readBy: [],
          createdAt: at,
        }
      : null,
    unreadCount: 0,
    myLastReadSeq: 0,
    pinned,
    muted: false,
    snoozed: false,
  };
}

describe('sortByActivity — единый список бесед', () => {
  it('свежие сверху, без сообщений — в конце', () => {
    const sorted = sortByActivity([
      conv('a', '2026-09-01T10:00:00Z'),
      conv('b', null),
      conv('c', '2026-09-02T10:00:00Z'),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('закреплённые — всегда сверху, между собой по активности', () => {
    const sorted = sortByActivity([
      conv('fresh', '2026-09-05T10:00:00Z'),
      conv('pin-old', '2026-09-01T10:00:00Z', true),
      conv('pin-new', '2026-09-03T10:00:00Z', true),
      conv('plain', '2026-09-04T10:00:00Z'),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['pin-new', 'pin-old', 'fresh', 'plain']);
  });

  it('закреплённая без сообщений выше обычной со сообщениями', () => {
    const sorted = sortByActivity([
      conv('plain', '2026-09-04T10:00:00Z'),
      conv('pin-empty', null, true),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['pin-empty', 'plain']);
  });

  it('черновики — сразу за закреплёнными, выше остальных (канон #91)', () => {
    const sorted = sortByActivity(
      [
        conv('fresh', '2026-09-05T10:00:00Z'),
        conv('draft-old', '2026-09-01T10:00:00Z'),
        conv('pin', '2026-09-02T10:00:00Z', true),
        conv('draft-empty', null),
      ],
      (id) => id === 'draft-old' || id === 'draft-empty',
    );
    expect(sorted.map((c) => c.id)).toEqual(['pin', 'draft-old', 'draft-empty', 'fresh']);
  });
});

describe('canPostFeed (матрица прав канала)', () => {
  const mk = (
    myRole: 'owner' | 'admin' | 'member',
    post: 'owner' | 'admin' | 'member',
  ): ConversationListItem => ({
    ...conv('c1', null),
    type: 'project_channel',
    myRole,
    permissions: {
      changeInfo: 'admin',
      addMembers: 'member',
      removeMembers: 'admin',
      post,
      manageSettings: 'owner',
    },
  });

  it('post=member — пишут все роли', () => {
    expect(canPostFeed(mk('member', 'member'))).toBe(true);
    expect(canPostFeed(mk('owner', 'member'))).toBe(true);
  });
  it('post=admin — member не публикует, admin/owner публикуют', () => {
    expect(canPostFeed(mk('member', 'admin'))).toBe(false);
    expect(canPostFeed(mk('admin', 'admin'))).toBe(true);
    expect(canPostFeed(mk('owner', 'admin'))).toBe(true);
  });
  it('post=owner — только владелец', () => {
    expect(canPostFeed(mk('admin', 'owner'))).toBe(false);
    expect(canPostFeed(mk('owner', 'owner'))).toBe(true);
  });
});
