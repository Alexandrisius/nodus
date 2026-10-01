// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@nodus/ui/components/tooltip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { PostCard } from './post-card.js';

const queryClient = new QueryClient();
const renderCard = (node: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );

/**
 * Карточка поста канала (вердикт владельца 30.09, #164 без отдельного
 * issue): аватар — в колонке слева (зона run-grid, в карточке его НЕТ),
 * имя — первая строка карточки; надгробие удалённого поста с живым тредом —
 * двухуровневое: строка «Сообщение удалено» + ТА ЖЕ полоса «Обсудить»
 * (доступ к обсуждениям сохраняется, правило #163 «по ответам»).
 */

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'p1',
  conversationId: 'conv-1',
  seq: 1,
  author: { id: 'a', displayName: 'Иван Петров', avatarUrl: null },
  text: 'текст поста',
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
  urgent: false,
  mentionedUserIds: [],
  createdAt: '2026-09-30T09:00:00Z',
  ...overrides,
});

const base = {
  mine: false,
  atEnd: false,
  showName: true,
  repliesCount: 0,
  participants: [],
  lastReplyAt: null,
  threadUnread: false,
  reactionsHidden: true,
  onOpenThread: vi.fn(),
};

afterEach(cleanup);

describe('PostCard — карточка поста канала с аватаром в колонке (#164)', () => {
  it('живой пост: имя — первая строка карточки; аватара ВНУТРИ карточки нет', () => {
    const { container } = renderCard(<PostCard {...base} message={message()} />);
    const card = container.querySelector('[data-slot="post-surface"]')!;
    expect(card.textContent).toContain('Иван Петров');
    // аватар рисует run-grid отдельным элементом, карточке аватар не нужен
    expect(card.querySelector('img, video')).toBeNull();
    expect(card.className).toContain('rounded-xl'); // мягкая карточка, не пузырь
  });

  it('живой пост: клик по карточке открывает тред', () => {
    const onOpenThread = vi.fn();
    const { container } = renderCard(
      <PostCard {...base} message={message()} onOpenThread={onOpenThread} />,
    );
    const card = container.querySelector('[data-slot="post-surface"]') as HTMLElement;
    card.click();
    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  it('надгробие с живым тредом: строка удаления + полоса-кнопка «Обсудить» → тред', () => {
    const onOpenThread = vi.fn();
    const { container } = renderCard(
      <PostCard
        {...base}
        message={message({ deletedAt: '2026-09-30T10:00:00Z', text: '', attachments: [] })}
        repliesCount={3}
        onOpenThread={onOpenThread}
      />,
    );
    // двухуровневость: строка удаления (data-slot tombstone) И полоса обсуждения
    expect(container.querySelector('[data-slot="message-tombstone"]')).not.toBeNull();
    const strip = container.querySelector('button')!;
    expect(strip.textContent).toContain('Обсудить');
    strip.click();
    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  it('надгробие без ответов: полосы обсуждения нет', () => {
    const { container } = renderCard(
      <PostCard
        {...base}
        message={message({ deletedAt: '2026-09-30T10:00:00Z', text: '', attachments: [] })}
      />,
    );
    expect(container.querySelector('[data-slot="message-tombstone"]')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('живой пост с ответами: счётчик и «Обсудить» в полосе', () => {
    const { container } = renderCard(
      <PostCard
        {...base}
        message={message({ threadRepliesCount: 2 })}
        repliesCount={2}
        lastReplyAt="2026-09-30T09:30:00Z"
      />,
    );
    expect(container.querySelector('[data-slot="post-surface"]')!.textContent).toContain(
      '2 ответа',
    );
    expect(container.querySelector('[data-slot="post-surface"]')!.textContent).toContain(
      'Обсудить',
    );
  });

  it('без ответов: счётчика «0 ответов» нет — в полосе только «Обсудить» (вердикт 30.09)', () => {
    const { container } = renderCard(<PostCard {...base} message={message()} />);
    const card = container.querySelector('[data-slot="post-surface"]')!;
    expect(card.textContent).toContain('Обсудить');
    expect(card.textContent).not.toContain('0 ответов');
  });

  it('серия: showName=false — видимого имени нет, sr-only автор остаётся', () => {
    const { container } = renderCard(<PostCard {...base} message={message()} showName={false} />);
    const card = container.querySelector('[data-slot="post-surface"]')!;
    const visible = [...card.querySelectorAll('span')].filter(
      (el) => el.textContent === 'Иван Петров' && !el.className.includes('sr-only'),
    );
    expect(visible).toHaveLength(0);
    expect(card.querySelector('.sr-only')?.textContent).toBe('Иван Петров: ');
  });

  it('надгробие показывает имя ВСЕГДА, даже не-первому в серии (#163: опора цепочки)', () => {
    const { container } = renderCard(
      <PostCard
        {...base}
        message={message({ deletedAt: '2026-09-30T10:00:00Z', text: '', attachments: [] })}
        showName={false}
      />,
    );
    const card = container.querySelector('[data-slot="post-surface"]')!;
    expect(card.textContent).toContain('Иван Петров');
  });
});
