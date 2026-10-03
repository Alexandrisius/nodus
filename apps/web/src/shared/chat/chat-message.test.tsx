// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@nodus/ui/components/tooltip';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { ChatMessageItem, MessageReactions } from './chat-message.js';
import { StickerMessageView } from './sticker-message.js';
import { useChatPrefs } from './chat-prefs.js';
import { uiPx } from '../ui/ui-scale.js';

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
  urgent: false,
  mentionedUserIds: [],
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

describe('ChatMessageItem — мета инлайном в строке текста (раунд 2 п.4, канон Telegram)', () => {
  it('время стоит в конце текста одной строкой: мета — inline внутри блока текста', () => {
    const { container } = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    const meta = content.querySelector('[data-slot="message-meta"]')!;
    expect(meta).toBeTruthy();
    // мета — inline-flex в блоке текста (не отдельная строка)
    expect(meta.className).toContain('inline-flex');
    const textBlock = meta.closest('span[class*="leading-tight"]');
    expect(textBlock).toBeTruthy();
    expect(textBlock!.textContent).toContain('текст сообщения');
    // блок текста — последний в пузыре (реакций нет): время прижато к низу
    expect(content.lastElementChild).toBe(textBlock);
    expect(textBlock!.className).toContain('pb-[5px]');
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

describe('Медиа-пузырь Telegram (#187): изображение = часть пузыря', () => {
  const img = (n: number, w: number, h: number) => ({
    id: `img-${n}`,
    fileId: `00000000-0000-4000-8000-00000000000${n}`,
    name: `фото-${n}.png`,
    size: 1000,
    mime: 'image/png',
    kind: 'image' as const,
    url: '/demo/site-1.png',
    thumbnailUrl: '/demo/site-1.png',
    previewKind: 'image' as const,
    pdfUrl: null,
    width: w,
    height: h,
  });

  it('чистое изображение без текста — BARE: пузыря нет, чип времени на картинке (#187 п.6)', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: '' })}
        mine={false}
      />,
    );
    // пузырь не рендерится вовсе — медиа-блок без Bubble
    expect(container.querySelector('[data-slot="bubble"]')).toBeNull();
    const bare = container.querySelector('[data-slot="media-message"]')!;
    expect(bare).toBeTruthy();
    const frame = bare.querySelector('span.overflow-hidden')!;
    expect(frame).toBeTruthy();
    // чип времени — поверх картинки, тёмная заливка, белый текст
    const chip = frame.querySelector('time')!.closest('span')!;
    expect(chip.className).toContain('bg-black/50');
    expect(chip.className).toContain('text-white');
    expect(chip.className).toContain('absolute');
  });

  it('чужое чистое изображение: пузырь-шапка с именем над bare-картинкой (раунд 2 п.9)', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: '' })}
        mine={false}
        showName
      />,
    );
    const block = container.querySelector('[data-slot="media-message"]')!;
    // шапка — пузырь с заливкой над картинкой (имя обязано быть на заливке)
    const headerBubble = block.querySelector('[data-slot="bubble"]')!;
    expect(headerBubble).toBeTruthy();
    const name = [...headerBubble.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    )!;
    expect(name.className).toMatch(/text-name-[1-7]/);
    // зазор сверху больше зазора до картинки (п.9)
    const headerBlock = name.parentElement!;
    expect(headerBlock.className).toContain('pt-2.5');
    expect(headerBlock.className).toContain('pb-[6px]');
    // шапка — до картинки; чип времени на картинке
    const frame = block.querySelector('span.overflow-hidden')!;
    expect(
      frame.compareDocumentPosition(headerBubble) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(frame.querySelector('time')).toBeTruthy();
  });

  it('СВОЁ чистое изображение: пузыря нет вообще, чип времени на картинке', () => {
    const { container } = renderMessage(
      <ChatMessageItem message={message({ attachments: [img(1, 1200, 800)], text: '' })} mine />,
    );
    expect(container.querySelector('[data-slot="bubble"]')).toBeNull();
    const block = container.querySelector('[data-slot="media-message"]')!;
    const frame = block.querySelector('span.overflow-hidden')!;
    expect(frame.querySelector('time')).toBeTruthy();
    // group/bubble на обёртке — ховер-пилюля реакций работает (раунд 2 п.3)
    expect(block.className).toContain('group/bubble');
  });

  it('bare: реакции — чипами ПОД картинкой (не пузырь)', () => {
    const withReaction = message({
      attachments: [img(1, 1200, 800)],
      text: '',
      reactions: [{ emoji: '👍', count: 1, mine: true, users: [] }],
    });
    const { container } = renderMessage(<ChatMessageItem message={withReaction} mine={false} />);
    const bare = container.querySelector('[data-slot="media-message"]')!;
    const frame = bare.querySelector('span.overflow-hidden')!;
    const chip = bare.querySelector('button[aria-pressed]')!;
    // чип реакции — после картинки в потоке bare-блока (п.9)
    expect(frame.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // и чип НЕ внутри картинки-блока
    expect(frame.contains(chip)).toBe(false);
  });

  it('медиа-пузырь с подписью — full-bleed: p-0 + border-0, ширина = медиа', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: 'подпись' })}
        mine={false}
      />,
    );
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    // full-bleed: боковых полей НЕТ, прозрачный бордюр снят (полоска п.1)
    expect(content.className).toContain('p-0');
    expect(content.className).toContain('border-0');
    expect(content.className).not.toContain('px-2.5');
    expect((content as HTMLElement).style.width).toBe(`${Math.round(uiPx(480))}px`);
    expect((content as HTMLElement).style.maxWidth).toBe('100%');
  });

  it('шапка с именем — блок С полями и зазором 6px до картинки (п.4)', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: 'подпись' })}
        mine={false}
        showName
      />,
    );
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    const name = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Иван Петров',
    )!;
    expect(content.firstElementChild).toBe(name.parentElement);
    expect(name.parentElement!.className).toContain('px-2.5');
    expect(name.parentElement!.className).toContain('pb-[6px]');
  });

  it('своё медиа-сообщение без шапки: изображение — первый блок пузыря', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: 'подпись' })}
        mine
      />,
    );
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    const first = content.firstElementChild!;
    expect(first.querySelector('img')).toBeTruthy();
    expect(first.className).not.toContain('px-2.5');
  });

  it('подпись с метой одной строкой, время у нижнего угла (раунд 2 п.2/п.4/п.7)', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: 'подпись к фото' })}
        mine={false}
        showName
      />,
    );
    const blocks = [
      ...container.querySelector('[data-slot="bubble-content"]')!.children,
    ] as HTMLElement[];
    // подпись + мета в ОДНОМ блоке (inline), блок — последний (реакций нет)
    const caption = blocks.find((b) => b.textContent?.includes('подпись к фото'))!;
    expect(caption.className).toContain('px-2.5');
    expect(caption.querySelector('[data-slot="message-meta"]')!.className).toContain('inline-flex');
    expect(caption.className).toContain('pb-[5px]');
    expect(blocks[blocks.length - 1]).toBe(caption);
  });

  it('плитка одиночного изображения держит пропорции: aspect-ratio вместо фикс-высоты', () => {
    const { container } = renderMessage(
      <ChatMessageItem
        message={message({ attachments: [img(1, 1200, 800)], text: '' })}
        mine={false}
      />,
    );
    const tile = container.querySelector('button[aria-label="фото-1.png"]') as HTMLElement;
    // ширина = ширина пузыря (w-full), высота — из пропорции габаритов
    expect(tile.style.aspectRatio).toBe(`${Math.round(uiPx(480))} / ${Math.round(uiPx(320))}`);
    expect(tile.style.height).toBe('');
    expect(tile.style.width).toBe('');
    expect(tile.className).toContain('w-full');
  });

  it('текстовый пузырь сохраняет единые поля 10px (#181)', () => {
    const { container } = renderMessage(<ChatMessageItem message={message()} mine={false} />);
    const content = container.querySelector('[data-slot="bubble-content"]')!;
    expect(content.className).toContain('px-2.5');
    expect(content.className).toContain('pt-2.5');
  });
});
