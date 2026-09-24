import { describe, expect, it } from 'vitest';
import type { ConversationListItem } from '@nodus/contracts';

import { sortByActivity } from './conversations.js';

function conv(id: string, at: string | null, pinned = false): ConversationListItem {
  return {
    id,
    type: 'direct',
    title: id,
    avatarUrl: null,
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
          createdAt: at,
        }
      : null,
    unreadCount: 0,
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
});
