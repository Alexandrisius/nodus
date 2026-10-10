// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

vi.mock('../api-client.js', () => ({
  api: vi.fn(async () => ({ items: [], nextCursor: null, lastSeq: 0 })),
}));

import { SelectionToolbar } from './selection-island.js';
import type { ComposerSelection } from './chat-composer.js';
import { useAuthStore } from '../auth-store.js';
import { api } from '../api-client.js';

/** #245 (фидбек владельца 10.10): корзина островка селекта видна не только
 *  «на все свои», но и модератору (админ беседы / право chat.moderate в
 *  группах/каналах) — на выделенных чужих сообщениях. */
const sel = (over: Partial<ComposerSelection> = {}): ComposerSelection => ({
  count: 2,
  ids: ['m1', 'm2'],
  allMine: false,
  onForward: () => {},
  onDelete: () => {},
  onCopy: () => {},
  onClear: () => {},
  ...over,
});

const group = (myRole: 'admin' | 'member'): ConversationListItem =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Группа',
    avatarUrl: null,
    myRole,
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
    membersCount: 3,
    lastMessage: null,
    lastActivityAt: null,
    unreadCount: 0,
    myLastReadSeq: 0,
    pinned: false,
    muted: false,
    snoozed: false,
  }) as ConversationListItem;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderToolbar(props: { sel: ComposerSelection; conversationId?: string }) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SelectionToolbar sel={props.sel} frozen={false} conversationId={props.conversationId} />
    </QueryClientProvider>,
  );
}

describe('SelectionToolbar: корзина модератора (#245)', () => {
  let conv: ConversationListItem = group('member');

  beforeEach(() => {
    vi.mocked(api).mockImplementation(async (url) => {
      if (String(url) === '/chat/conversations') {
        return { items: [conv], nextCursor: null, lastSeq: 0 };
      }
      return { items: [], nextCursor: null, lastSeq: 0 };
    });
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useAuthStore.setState({ user: null });
  });

  it('чужие выделены, обычный участник — корзины нет', () => {
    conv = group('member');
    useAuthStore.setState({
      user: { id: 'me', email: 'me@nodus.local', displayName: 'Я', permissions: [] },
    });
    renderToolbar({ sel: sel(), conversationId: 'conv-1' });
    expect(screen.queryByRole('button', { name: ui.chat.menu.delete })).toBeNull();
  });

  it('чужие выделены, админ беседы — корзина есть', async () => {
    conv = group('admin');
    useAuthStore.setState({
      user: { id: 'me', email: 'me@nodus.local', displayName: 'Я', permissions: [] },
    });
    renderToolbar({ sel: sel(), conversationId: 'conv-1' });
    expect(await screen.findByRole('button', { name: ui.chat.menu.delete })).toBeTruthy();
  });

  it('модератор портала (chat.moderate, участник) — корзина есть', async () => {
    conv = group('member');
    useAuthStore.setState({
      user: {
        id: 'me',
        email: 'me@nodus.local',
        displayName: 'Я',
        permissions: ['chat.moderate'],
      },
    });
    renderToolbar({ sel: sel(), conversationId: 'conv-1' });
    expect(await screen.findByRole('button', { name: ui.chat.menu.delete })).toBeTruthy();
  });

  it('все свои — корзина есть и без прав (канон tdesktop)', () => {
    conv = group('member');
    useAuthStore.setState({
      user: { id: 'me', email: 'me@nodus.local', displayName: 'Я', permissions: [] },
    });
    renderToolbar({ sel: sel({ allMine: true }), conversationId: 'conv-1' });
    expect(screen.getByRole('button', { name: ui.chat.menu.delete })).toBeTruthy();
  });
});
