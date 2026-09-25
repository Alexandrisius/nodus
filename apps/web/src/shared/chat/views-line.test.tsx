// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, ConversationListItem } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { chatKeys } from './api.js';
import { ConversationViewsLine } from './views-line.js';

/** Строка просмотров над композером (#102 раунд 2): одна строка на беседу для
 *  СВОЕГО последнего сообщения; группы — «Имя и ещё N» с попапом, direct —
 *  «дата, время»; не просмотрено / нет своих — строки нет. */
const queryClient = new QueryClient();

const conv = (type: 'group' | 'direct'): ConversationListItem =>
  ({
    id: 'conv-1',
    type,
    title: null,
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
    membersPreview: [
      { id: 'me', displayName: 'Я', avatarUrl: null },
      { id: 'u1', displayName: 'Анна Первая', avatarUrl: null },
      { id: 'u2', displayName: 'Борис Второй', avatarUrl: null },
    ],
    lastMessage: null,
    unreadCount: 0,
    myLastReadSeq: 0,
    pinned: false,
    muted: false,
    snoozed: false,
  }) as ConversationListItem;

const msg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversationId: 'conv-1',
  seq: 1,
  author: { id: 'me', displayName: 'Я', avatarUrl: null },
  text: 'текст',
  replyToId: null,
  reply: null,
  threadRootId: null,
  threadRepliesCount: 0,
  reactions: [],
  attachments: [],
  editedAt: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  readAt: null,
  readBy: [],
  createdAt: '2026-09-25T10:00:00Z',
  ...overrides,
});

function renderLine(type: 'group' | 'direct', messages: ChatMessage[]) {
  queryClient.setQueryData(chatKeys.conversations(), {
    items: [conv(type)],
    nextCursor: null,
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationViewsLine conversationId="conv-1" messages={messages} />
    </QueryClientProvider>,
  );
}

describe('ConversationViewsLine (#102 раунд 2)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'me', email: 'me@test.nodus', displayName: 'Я', permissions: [] },
    });
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it('группа: просмотрено → «Имя» + «и ещё N» для последнего своего', () => {
    renderLine('group', [
      msg({
        id: 'm0',
        seq: 1,
        readBy: [{ id: 'u1', displayName: 'Анна Первая', avatarUrl: null }],
      }),
      msg({
        id: 'm1',
        seq: 2,
        readBy: [
          { id: 'u1', displayName: 'Анна Первая', avatarUrl: null },
          { id: 'u2', displayName: 'Борис Второй', avatarUrl: null },
        ],
      }),
    ]);
    // Строка — по ПОСЛЕДНЕМУ своему: 2 посмотревших → «и ещё 1».
    expect(screen.getByText('Просмотрено:')).toBeTruthy();
    expect(screen.getByText('Анна Первая')).toBeTruthy();
    expect(screen.getByText('и ещё 1')).toBeTruthy();
  });

  it('direct: просмотрено → «Просмотрено: {дата}, {время}» без имён', () => {
    renderLine('direct', [msg({ readAt: '2026-09-25T10:00:00Z' })]);
    // Время — в локальной зоне хоста: проверяем формат, не конкретный час.
    expect(screen.getByText(/Просмотрено: (сегодня|Сегодня), \d{2}:\d{2}/u)).toBeTruthy();
  });

  it('не просмотрено / нет своих / удалённое последнее — строки нет', () => {
    const { rerender } = renderLine('group', [msg({ readBy: [] })]);
    expect(screen.queryByText('Просмотрено:')).toBeNull();
    // Последнее своё удалено → показывать нечего.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationViewsLine
          conversationId="conv-1"
          messages={[msg({ deletedAt: '2026-09-25T10:00:00Z', readBy: [] })]}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Просмотрено:')).toBeNull();
    // Нет своих сообщений вовсе.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationViewsLine
          conversationId="conv-1"
          messages={[msg({ author: { id: 'u1', displayName: 'Анна', avatarUrl: null } })]}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Просмотрено:')).toBeNull();
  });
});
