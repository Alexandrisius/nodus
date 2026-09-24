// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { ChatMessageItem } from './chat-message.js';

/**
 * Пузырь сообщения (#96): имя автора — ВНУТРИ облака верхней строкой (только
 * у чужого первого сообщения серии — флаг showName выставляет хост ленты),
 * мета — отдельной нижней строкой под содержимым (не инлайн в текст).
 */

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversationId: 'conv-1',
  author: { id: 'a', displayName: 'Иван Петров', avatarUrl: null },
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
  readAt: null,
  createdAt: '2026-09-24T09:00:00Z',
  ...overrides,
});

afterEach(cleanup);

describe('ChatMessageItem — имя автора внутри пузыря (#96)', () => {
  it('showName: имя внутри [data-slot="bubble"] верхней строкой над содержимым', () => {
    const { container } = render(<ChatMessageItem message={message()} mine={false} showName />);
    const name = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    );
    expect(name).toBeTruthy();
    // имя — потомок пузыря, а не строка НАД ним
    expect(name!.closest('[data-slot="bubble"]')).toBeTruthy();
    const bubbleContent = name!.closest('[data-slot="bubble-content"]')!;
    expect(bubbleContent.firstElementChild).toBe(name);
  });

  it('имя акцентным тоном (text-info) и полужирное — реф Битрикс24', () => {
    const { container } = render(<ChatMessageItem message={message()} mine={false} showName />);
    const name = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    );
    expect(name!.className).toContain('text-info');
    expect(name!.className).toContain('font-semibold');
  });

  it('без showName видимого имени нет — только sr-only автор для скринридера', () => {
    const { container } = render(<ChatMessageItem message={message()} mine={false} />);
    expect(container.querySelector('.sr-only')?.textContent).toBe('Иван Петров: ');
    const visible = [...container.querySelectorAll('span')].filter(
      (el) => el.textContent === 'Иван Петров' && !el.className.includes('sr-only'),
    );
    expect(visible).toHaveLength(0);
  });
});

describe('ChatMessageItem — мета отдельной нижней строкой (#96)', () => {
  it('мета — в последней строке содержимого пузыря, не в строке текста', () => {
    const { container } = render(<ChatMessageItem message={message()} mine={false} />);
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    const meta = content.querySelector('[data-slot="message-meta"]');
    expect(meta).toBeTruthy();
    const lastRow = content.lastElementChild!;
    expect(lastRow.contains(meta!)).toBe(true);
    // текст сообщения — отдельный блок, меты в нём нет
    const textRow = [...content.children].find((el) => el.textContent === 'текст сообщения');
    expect(textRow).toBeTruthy();
    expect(textRow!.contains(meta!)).toBe(false);
  });

  it('у своего сообщения — галочки прочтения, у чужого нет', () => {
    const mine = render(<ChatMessageItem message={message()} mine />);
    expect(mine.container.querySelector('[data-slot="message-meta"] svg')).toBeTruthy();
    mine.unmount();

    const theirs = render(<ChatMessageItem message={message()} mine={false} />);
    expect(theirs.container.querySelector('[data-slot="message-meta"] svg')).toBeNull();
  });
});
