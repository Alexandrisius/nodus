// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationListItem, Paginated } from '@nodus/contracts';

import { chatKeys } from './api.js';
import { useUnreadTitle } from './unread-title.js';

/** (N) Nodus в заголовке вкладки (#124): сумма unreadCount списка бесед. */

function item(unreadCount: number): ConversationListItem {
  return {
    id: `c-${unreadCount}`,
    type: 'group',
    title: 'беседа',
    avatarUrl: null,
    myRole: 'member',
    permissions: {
      changeInfo: 'owner',
      addMembers: 'owner',
      removeMembers: 'owner',
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
    lastMessage: null,
    unreadCount,
    myLastReadSeq: 0,
    pinned: false,
    muted: false,
    snoozed: false,
  };
}

function setup(items: ConversationListItem[]) {
  const client = new QueryClient();
  client.setQueryData<Paginated<ConversationListItem>>(chatKeys.conversations(), {
    items,
    nextCursor: null,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items, nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  return renderHook(() => useUnreadTitle(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  document.title = 'Nodus';
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('useUnreadTitle (#124)', () => {
  it('сумма непрочитанных — в скобках перед именем', async () => {
    setup([item(2), item(3), item(0)]);
    await waitFor(() => expect(document.title).toBe('(5) Nodus'));
  });

  it('нет непрочитанных — базовое имя', async () => {
    document.title = '(7) Nodus';
    setup([item(0)]);
    await waitFor(() => expect(document.title).toBe('Nodus'));
  });
});
