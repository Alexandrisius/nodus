// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { MessageMenu } from './message-menu.js';

/** Структура контекстного меню (раунд 4): «Кто просмотрел» — ПОДМЕНЮ над
 * «Удалить» у своих живых сообщений с непустым readBy; у чужих / без
 * просмотров / в режиме селекта — подменю нет. Спека владельца: прежний
 * пункт с попапом «мгновенно пропадал» (война фокуса). */

const queryClient = new QueryClient();

const msg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversationId: 'conv-1',
  seq: 1,
  author: { id: 'me', displayName: 'Я', avatarUrl: null },
  text: 'текст сообщения',
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
  readAt: '2026-09-25T10:00:00.000Z',
  readBy: [
    { id: 'u1', displayName: 'Анна Первая', avatarUrl: null },
    { id: 'u2', displayName: 'Борис Второй', avatarUrl: null },
  ],
  createdAt: '2026-09-25T09:00:00.000Z',
  ...overrides,
});

function renderMenu(message: ChatMessage, mine: boolean) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MessageMenu
        message={message}
        mine={mine}
        conversationId="conv-1"
        scope="conversation:conv-1"
      >
        <span>пузырь</span>
      </MessageMenu>
    </QueryClientProvider>,
  );
}

function openMenu() {
  const bubble = screen.getByText('пузырь');
  fireEvent.contextMenu(bubble, { button: 2, clientX: 10, clientY: 10 });
  // Появление портала меню асинхронно (Radix) — ждём любой пункт.
  return screen.findByRole('menuitem', { name: ui.chat.menu.copy });
}

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('MessageMenu: подменю «Кто просмотрел» (раунд 4)', () => {
  it('своё сообщение с просмотрами: подменю есть, НАД «Удалить»', async () => {
    renderMenu(msg(), true);
    await openMenu();

    const submenuTrigger = screen.getByRole('menuitem', { name: ui.chat.whoViewed });
    expect(submenuTrigger).toBeTruthy();
    expect(submenuTrigger.getAttribute('data-slot')).toBe('context-menu-sub-trigger');

    // Порядок: подменю стоит выше пункта «Удалить» в DOM меню.
    const deleteItem = screen.getByRole('menuitem', { name: ui.chat.menu.delete });
    expect(submenuTrigger.compareDocumentPosition(deleteItem)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('чужое сообщение: подменю нет (просмотры видит автор)', async () => {
    renderMenu(msg(), false);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: ui.chat.whoViewed })).toBeNull();
  });

  it('своё, но никто не просмотрел (readBy пуст): подменю нет', async () => {
    renderMenu(msg({ readBy: [], readAt: null }), true);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: ui.chat.whoViewed })).toBeNull();
  });

  it('надгробие удалённого: подменю нет', async () => {
    renderMenu(msg({ deletedAt: '2026-09-25T10:30:00.000Z' }), true);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: ui.chat.whoViewed })).toBeNull();
  });
});
