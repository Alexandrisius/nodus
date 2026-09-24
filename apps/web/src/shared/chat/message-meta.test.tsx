// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { MessageMeta } from './message-meta.js';

/**
 * Мета сообщения (#96): одна композиция на пузырь чата и карточку поста
 * канала — пин → «изменено» → время; галочки прочтения — только по флагу
 * `ticks` (у постов каналов их нет по семантике).
 */

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversationId: 'conv-1',
  author: { id: 'a', displayName: 'Анна Смирнова', avatarUrl: null },
  text: 'текст',
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
  createdAt: '2026-09-24T09:00:00Z',
  ...overrides,
});

afterEach(cleanup);

describe('MessageMeta — композиция меты (#96)', () => {
  it('пин, «изменено» и время в порядке состава; время несёт dateTime', () => {
    const { container } = render(
      <MessageMeta message={message({ pinned: true, editedAt: '2026-09-24T10:00:00Z' })} ticks />,
    );
    const meta = container.querySelector('[data-slot="message-meta"]');
    expect(meta).toBeTruthy();
    expect(meta!.querySelector('[role="img"]')).toBeTruthy();
    expect(meta!.textContent).toContain('изменено');
    const time = meta!.querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe('2026-09-24T09:00:00Z');
    // состав в порядке: пин — раньше «изменено», «изменено» — раньше времени
    const order = [
      meta!.querySelector('[role="img"]'),
      [...meta!.children].find((el) => el.textContent === 'изменено'),
      time,
    ];
    expect(
      order.every(
        (el, i) =>
          i === 0 ||
          (el &&
            order[i - 1] &&
            el.compareDocumentPosition(order[i - 1]!) & Node.DOCUMENT_POSITION_PRECEDING),
      ),
    ).toBe(true);
  });

  it('без закрепа и правки — только время', () => {
    const { container } = render(<MessageMeta message={message()} />);
    const meta = container.querySelector('[data-slot="message-meta"]')!;
    expect(meta.querySelector('[role="img"]')).toBeNull();
    expect(meta.textContent).not.toContain('изменено');
    expect(meta.querySelector('time')).toBeTruthy();
  });

  it('галочки прочтения только по ticks (пост канала их не рисует)', () => {
    const mine = message({ readAt: '2026-09-24T10:00:00Z' });
    const card = render(<MessageMeta message={mine} />);
    expect(card.container.querySelector('svg')).toBeNull();
    card.unmount();

    const bubble = render(<MessageMeta message={mine} mine ticks />);
    expect(bubble.container.querySelector('svg')).toBeTruthy();
  });

  it('свой тон и внешние классы применяются (ml-auto в строке пузыря)', () => {
    const { container } = render(
      <MessageMeta message={message()} mine ticks className="ml-auto" />,
    );
    const meta = container.querySelector('[data-slot="message-meta"]')!;
    expect(meta.className).toContain('text-primary-foreground/70');
    expect(meta.className).toContain('ml-auto');
  });
});
