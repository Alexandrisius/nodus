// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Paginated, UserRef } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { chatKeys } from './api.js';
import { ReactionPicker } from './reaction-picker.js';

/**
 * Ховер-попап реакций (#124, вердикты 27.09): открывается НАВЕДЕНИЕМ на
 * кнопку в нижнем углу пузыря; раскрытие сетки — панель на месте (grid-rows);
 * клик по эмодзи — оптимистичный toggle с users в чипе.
 * nwsapi (jsdom) не матчит не-BMP-эмодзи в attribute-селекторах — ищем JS-ом.
 */

const CONV = '11111111-1111-4111-8111-111111111111';
const M1 = '22222222-2222-4222-8222-222222222222';
const ME_REF: UserRef = { id: 'me', displayName: 'Я', avatarUrl: null };

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: M1,
  conversationId: CONV,
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
  createdAt: '2026-09-27T09:00:00Z',
  ...overrides,
});

function emojiButton(label: string): Element | null {
  return (
    Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === label,
    ) ?? null
  );
}

function setup() {
  const client = new QueryClient();
  client.setQueryData<Paginated<ChatMessage>>(chatKeys.messages(CONV), {
    items: [message()],
    nextCursor: null,
  });
  const posted = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posted(init?.body);
        return new Response(
          JSON.stringify(
            message({ reactions: [{ emoji: '👍', count: 1, mine: true, users: [ME_REF] }] }),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const utils = render(
    <QueryClientProvider client={client}>
      <ReactionPicker message={message()} atEnd={false} />
    </QueryClientProvider>,
  );
  return { client, posted, ...utils };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({
    user: { id: 'me', displayName: 'Я', email: 'me@nodus.by', permissions: [] },
  });
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

describe('ReactionPicker (#124, вердикты 27.09)', () => {
  it('открывается НАВЕДЕНИЕМ; клик по эмодзи — оптимистичный чип с users', async () => {
    const { client, posted, container } = setup();
    const trigger = container.querySelector('[data-slot="reaction-picker-trigger"]');
    expect(trigger).not.toBeNull();
    // Кнопка — в НИЖНЕМ углу пузыря (вердикт п.1).
    expect(trigger?.className).toContain('-bottom-3');

    fireEvent.mouseEnter(trigger as Element);
    const emoji = await vi.waitFor(() => {
      const found = emojiButton('👍');
      expect(found).not.toBeNull();
      return found as Element;
    });
    // Эмодзи выбора ×1.5 (вердикт п.3) — анимированный APNG-глиф 24px.
    const glyph = Array.from(emoji.querySelectorAll('img')).find((img) => img.alt === '👍');
    expect(glyph?.className).toContain('size-6');

    fireEvent.click(emoji);
    await waitFor(() => expect(posted).toHaveBeenCalled());
    const cached = (
      client.getQueryData<Paginated<ChatMessage>>(chatKeys.messages(CONV)) as Paginated<ChatMessage>
    ).items[0];
    expect(cached?.reactions).toEqual([{ emoji: '👍', count: 1, mine: true, users: [ME_REF] }]);
  });

  it('раскрытие сетки — панель на месте, сетка выезжает вниз (grid-rows)', async () => {
    const { container } = setup();
    const trigger = container.querySelector('[data-slot="reaction-picker-trigger"]') as Element;
    fireEvent.mouseEnter(trigger);
    const more = await vi.waitFor(() => {
      const found = document.body.querySelector('button[aria-expanded="false"]');
      expect(found).not.toBeNull();
      return found as Element;
    });
    fireEvent.click(more);
    await vi.waitFor(() => {
      expect(emojiButton('🙏')).not.toBeNull();
    });
    // Контейнер раскрытия — grid-rows-анимация без перепрыгивания попапа.
    expect(document.body.querySelector('.grid-rows-\\[1fr\\]')).not.toBeNull();
  });
});
