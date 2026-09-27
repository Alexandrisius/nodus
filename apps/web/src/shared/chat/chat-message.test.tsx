// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@nodus/ui/components/tooltip';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { ChatMessageItem, MessageReactions } from './chat-message.js';

// QueryClient остаётся: пузырь живёт в дереве с запросами ленты.
const queryClient = new QueryClient();
const renderMessage = (node: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      {/* Тултип «кто поставил» на чипах реакций требует Provider (#124). */}
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );

/**
 * Пузырь сообщения (#96): имя автора — ВНУТРИ облака верхней строкой (только
 * у чужого первого сообщения серии — флаг showName выставляет хост ленты),
 * мета — отдельной нижней строкой под содержимым (не инлайн в текст).
 */

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversationId: 'conv-1',
  seq: 1,
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
  readBy: [],
  createdAt: '2026-09-24T09:00:00Z',
  ...overrides,
});

afterEach(cleanup);

function imgByAlt(root: Element | null, emoji: string): Element | null {
  return Array.from(root?.querySelectorAll('img') ?? []).find((img) => img.alt === emoji) ?? null;
}

describe('ChatMessageItem — имя автора внутри пузыря (#96)', () => {
  it('showName: имя внутри [data-slot="bubble"] верхней строкой над содержимым', () => {
    const { container } = renderMessage(
      <ChatMessageItem message={message()} mine={false} showName />,
    );
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
    const { container } = renderMessage(
      <ChatMessageItem message={message()} mine={false} showName />,
    );
    const name = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    );
    expect(name!.className).toContain('text-info');
    expect(name!.className).toContain('font-semibold');
  });

  it('без showName видимого имени нет — только sr-only автор для скринридера', () => {
    const { container } = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    expect(container.querySelector('.sr-only')?.textContent).toBe('Иван Петров: ');
    const visible = [...container.querySelectorAll('span')].filter(
      (el) => el.textContent === 'Иван Петров' && !el.className.includes('sr-only'),
    );
    expect(visible).toHaveLength(0);
  });
});

describe('ChatMessageItem — мета отдельной нижней строкой (#96)', () => {
  it('мета — в последней строке содержимого пузыря, не в строке текста', () => {
    const { container } = renderMessage(<ChatMessageItem message={message()} mine={false} />);
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
    const mine = renderMessage(<ChatMessageItem message={message()} mine />);
    expect(mine.container.querySelector('[data-slot="message-meta"] svg')).toBeTruthy();
    mine.unmount();

    const theirs = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    expect(theirs.container.querySelector('[data-slot="message-meta"] svg')).toBeNull();
  });
});

describe('Заливка пузырей — токены bubble-* (канон Telegram, #127)', () => {
  it('свой пузырь — bg-bubble-out, чужой — bg-bubble-in (не global primary/card)', () => {
    const mine = renderMessage(<ChatMessageItem message={message()} mine />);
    expect(mine.container.querySelector('[data-slot="bubble"]')!.className).toContain(
      'bg-bubble-out',
    );
    mine.unmount();

    const theirs = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    expect(theirs.container.querySelector('[data-slot="bubble"]')!.className).toContain(
      'bg-bubble-in',
    );
  });

  it('мета своего — акцент пузыря, чужого — muted-foreground', () => {
    const mine = renderMessage(<ChatMessageItem message={message()} mine />);
    expect(mine.container.querySelector('[data-slot="message-meta"]')!.className).toContain(
      'text-bubble-out-accent',
    );
    mine.unmount();

    const theirs = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    expect(theirs.container.querySelector('[data-slot="message-meta"]')!.className).toContain(
      'text-muted-foreground',
    );
  });

  it('цитата в своём пузыре — бар и имя акцентом пузыря, в чужом — info', () => {
    const reply = {
      id: 'r1',
      author: { id: 'a', displayName: 'Иван Петров', avatarUrl: null },
      text: 'оригинал',
      quoteText: null,
      attachmentKind: null,
      deleted: false,
    } as never;
    const mine = renderMessage(
      <ChatMessageItem message={message({ reply })} mine showName={false} />,
    );
    const mineBar = mine.container.querySelector('[data-slot="bubble-content"] span[aria-hidden]');
    expect(mineBar!.className).toContain('bg-bubble-out-accent');
    mine.unmount();

    const theirs = renderMessage(<ChatMessageItem message={message({ reply })} mine={false} />);
    const theirBar = theirs.container.querySelector(
      '[data-slot="bubble-content"] span[aria-hidden]',
    );
    expect(theirBar!.className).toContain('bg-info');
  });

  it('чипы реакций на залитом пузыре — акцент пузыря, на чужом — info/нейтраль', () => {
    const withReaction = message({
      reactions: [{ emoji: '👍', count: 1, mine: true, users: [] }],
    });
    const onOut = renderMessage(<MessageReactions message={withReaction} onFilled />);
    expect(onOut.container.querySelector('button[aria-pressed]')!.className).toContain(
      'border-bubble-out-accent/40',
    );
    onOut.unmount();

    const onIn = renderMessage(<MessageReactions message={withReaction} />);
    expect(onIn.container.querySelector('button[aria-pressed]')!.className).toContain(
      'border-info/40',
    );
  });
});

describe('Реакции — кнопки-toggle (#124)', () => {
  afterEach(cleanup);

  it('чип — button с aria-pressed и счётчиком', () => {
    const { container } = renderMessage(
      <MessageReactions
        message={message({
          reactions: [
            {
              emoji: '👍',
              count: 2,
              mine: true,
              users: [
                { id: 'u1', displayName: 'Я', avatarUrl: null },
                { id: 'u2', displayName: 'Ты', avatarUrl: null },
              ],
            },
          ],
        })}
      />,
    );
    const chip = container.querySelector('button[aria-pressed="true"]');
    expect(chip).not.toBeNull();
    // Эмодзи чипа — анимированный APNG с юникодом в alt (счётчик — текстом).
    expect(imgByAlt(chip, '👍')).not.toBeNull();
    expect(chip?.textContent).toContain('2');
  });

  it('реакция БЕЗ users (api из main) не роняет ленту — чип рендерится', () => {
    // Регрессия краша 27.09: дев-фронт опередил прод-api без поля users.
    const legacy = message({
      reactions: [{ emoji: '🔥', count: 2, mine: false } as never],
    });
    const { container } = renderMessage(<MessageReactions message={legacy} />);
    const chip = container.querySelector('button[aria-pressed]');
    expect(chip).not.toBeNull();
    expect(imgByAlt(chip, '🔥')).not.toBeNull();
  });

  it('ховер-кнопка попапа есть у пузыря (data-slot)', () => {
    const { container } = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    expect(container.querySelector('[data-slot="reaction-picker-trigger"]')).not.toBeNull();
  });
});
