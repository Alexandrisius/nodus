// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@nodus/ui/components/tooltip';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { ChatMessageItem, MessageReactions } from './chat-message.js';
import { StickerMessageView } from './sticker-message.js';
import { useChatPrefs } from './chat-prefs.js';

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
  clientMessageId: 'client-1',
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
  urgent: false,
  mentionedUserIds: [],
  linkPreview: null,
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

  it('имя персональным тоном палитры --name-* и полужирное (#180, модель Telegram)', () => {
    const { container } = renderMessage(
      <ChatMessageItem message={message()} mine={false} showName />,
    );
    const name = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    );
    expect(name!.className).toMatch(/text-name-[1-7]/);
    expect(name!.className).toContain('font-semibold');
    // детерминизм: тот же автор — тот же тон
    const again = renderMessage(<ChatMessageItem message={message()} mine={false} showName />);
    const name2 = [...again.container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    );
    expect(name2!.className).toBe(name!.className);
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

describe('ChatMessageItem — время: призрак+булавка, стабильный угол (р.10)', () => {
  it('без реакций: невидимый призрак в потоке + абсолют от края пузыря', () => {
    const { container } = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    // булавка: абсолют, стабильные инсеты от края (8px низ / 12.5px право)
    const pin = content.querySelector('[data-slot="meta-corner"]')!;
    expect(pin).toBeTruthy();
    expect(pin.className).toContain('absolute');
    expect(pin.className).toContain('right-2.5');
    expect(pin.className).toContain('bottom-[8px]');
    expect(pin.querySelector('[data-slot="message-meta"]')).toBeTruthy();
    // якорь — сам ПУЗЫРЬ (bubble-content): инсеты от края, как у рядов реакций
    expect(pin.parentElement).toBe(content);
    expect(pin.parentElement!.textContent).toContain('текст сообщения');
    // призрак: невидимая копия в потоке — резервирует ширину метки
    const ghost = [...content.querySelectorAll('[data-slot="message-meta"]')].find((m) =>
      m.className.includes('invisible'),
    )!;
    expect(ghost).toBeTruthy();
    expect(content.className).toContain('pb-[8px]');
  });

  it('с реакциями: время — строкой ниже, СПРАВА от реакций (р.3 п.1)', () => {
    const withReaction = message({
      reactions: [{ emoji: '👍', count: 1, mine: true, users: [] }],
    });
    const { container } = renderMessage(<ChatMessageItem message={withReaction} mine={false} />);
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    const last = content.lastElementChild!;
    // последняя строка = реакции + мета справа (ml-auto)
    expect(last.className).toContain('flex');
    const meta = last.querySelector('[data-slot="message-meta"]')!;
    expect(meta.className).toContain('ml-auto');
    // флоат-меты в блоке текста НЕТ (время ушло на строку реакций)
    const textBlock = [...content.children].find((el) => el.textContent === 'текст сообщения');
    expect(textBlock!.querySelector('[data-slot="message-meta"]')).toBeNull();
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

  it('цитата: плашка в цвете цитируемого — тинт + левая линия единым целым (#187 п.8)', () => {
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
    // плашка цитаты: левая линия = левый КРАЙ плашки (border-l-2), не отдельная
    // палочка; тон линии и фона — персональная переменная автора цитаты.
    const quote = [...mine.container.querySelectorAll('[data-slot="bubble-content"] *')].find(
      (el) => (el as HTMLElement).style?.borderLeftColor,
    ) as HTMLElement | undefined;
    expect(quote).toBeTruthy();
    expect(quote!.className).toContain('border-l-2');
    expect(quote!.style.borderLeftColor).toMatch(/var\(--name-[1-7]\)/);
    expect(quote!.style.backgroundColor).toContain('color-mix');
    // имя цитируемого — тон personTone (не info/акцент пузыря), одинаково
    // на своём и чужом пузыре: identity автора цитаты.
    const quoteName = [...mine.container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    );
    expect(quoteName!.className).toMatch(/text-name-[1-7]/);
    mine.unmount();

    // удалённый оригинал без автора — нейтральный тинт поверхности
    const deletedReply = Object.assign({}, reply, {
      deleted: true,
      obliterated: false,
      author: null,
    }) as never;
    const theirs = renderMessage(
      <ChatMessageItem message={message({ reply: deletedReply })} mine={false} />,
    );
    const quote2 = [...theirs.container.querySelectorAll('[data-slot="bubble-content"] *')].find(
      (el) => (el as HTMLElement).style?.borderLeftColor,
    ) as HTMLElement | undefined;
    expect(quote2!.style.borderLeftColor).toBe('var(--info)');
  });

  it('чипы реакций на залитом пузыре — акцент пузыря, на чужом — info/нейтраль', () => {
    const withReaction = message({
      reactions: [{ emoji: '👍', count: 1, mine: true, users: [] }],
    });
    const onOut = renderMessage(<MessageReactions message={withReaction} onFilled />);
    expect(onOut.container.querySelector('button[aria-pressed]')!.className).toContain(
      'border-bubble-out-accent/50',
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

describe('Стикер — выравнивание «По обе стороны» (баг-вердикт 30.09, #164)', () => {
  const sticker = {
    id: 'a1',
    fileId: 'f1',
    name: 'sticker.webp',
    size: 24_000,
    mime: 'image/webp',
    kind: 'sticker',
    url: '/reactions/eyes.webp',
    thumbnailUrl: null,
    previewKind: 'image',
    pdfUrl: null,
    width: 64,
    height: 64,
    sticker: { packId: 'p1', packTitle: 'Кадры', packScope: 'personal', emojis: ['👀'] },
  } as never;

  it('контейнер стикера несёт data-slot: при align=end (свои справа) он прижат self-end', () => {
    useChatPrefs.setState({ align: 'both' });
    const { container } = renderMessage(
      <StickerMessageView message={message()} attachment={sticker} mine />,
    );
    const msg = container.querySelector('[data-slot="message"]')!;
    expect(msg.getAttribute('data-align')).toBe('end');
    // механизм: MessageContent прижимает вправо прямых детей С data-slot —
    // у стикера data-slot быть обязан, иначе он остаётся слева (баг 30.09)
    const stickerEl = container.querySelector('[data-slot="sticker-message"]')!;
    expect(stickerEl).not.toBeNull();
    const content = container.querySelector('[data-slot="message-content"]')!;
    expect(content.className).toContain('data-slot:self-end');
    useChatPrefs.setState({ align: 'one' });
  });
});
