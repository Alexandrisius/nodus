// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { isSingleEmoji, MessageText } from './message-text.js';
import { httpUrlSegments } from './link-preview-card.js';

/** Одиночный эмодзи (#130, канон Telegram single-emoji): крупный живой глиф. */

afterEach(cleanup);

function glyph(root: HTMLElement, emoji: string): Element | null {
  return (
    Array.from(root.querySelectorAll('img, span')).find(
      (el) => el.tagName === 'IMG' && el.getAttribute('alt') === emoji,
    ) ?? null
  );
}

describe('MessageText — одиночный эмодзи (#130)', () => {
  it('одиночный эмодзи с анимацией — крупный WebP-глиф', () => {
    const { container } = render(<MessageText text="🔥" />);
    const img = glyph(container, '🔥');
    expect(img).not.toBeNull();
    expect(img?.className).toContain('size-11');
  });

  it('одиночный эмодзи без анимации — крупный глиф шрифтом', () => {
    const { container } = render(<MessageText text="🧭" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('🧭');
    // Глиф — ВНУТРИ маркера текста (обёрнут data-slot, #132 рамка выделения).
    const span = container.querySelector('[data-slot="message-text"] span');
    expect(span?.className).toContain('text-4xl');
  });

  it('текст с эмодзи и пробелами — обычный текст', () => {
    const { container } = render(<MessageText text="привет 👋 друг" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('привет');
  });
});

describe('isSingleEmoji (#130)', () => {
  it('эмодзи/текст/ZWJ-цепочки', () => {
    expect(isSingleEmoji('🔥')).toBe(true);
    expect(isSingleEmoji(' 🔥 ')).toBe(true);
    expect(isSingleEmoji('👍👍')).toBe(false);
    expect(isSingleEmoji('огонь')).toBe(false);
    expect(isSingleEmoji('')).toBe(false);
    // ZWJ-последовательность (рукопожатие и т.п.) — один кластер.
    expect(isSingleEmoji('🧑‍🔬')).toBe(true);
  });
});

describe('Автолинк http(s)-ссылок (#212 ревизия: ссылка — гипертекст)', () => {
  it('httpUrlSegments: ссылка с хвостовой пунктуацией — пунктуация текстом', () => {
    expect(httpUrlSegments('см. https://example.com/a, далее')).toEqual([
      { kind: 'text', value: 'см. ' },
      { kind: 'url', url: 'https://example.com/a' },
      { kind: 'text', value: ', далее' },
    ]);
  });

  it('httpUrlSegments: без ссылок — один текстовый кусок; пустой текст — пустой', () => {
    expect(httpUrlSegments('просто текст')).toEqual([{ kind: 'text', value: 'просто текст' }]);
    expect(httpUrlSegments('')).toEqual([{ kind: 'text', value: '' }]);
  });

  it('httpUrlSegments: несколько ссылок подряд', () => {
    expect(httpUrlSegments('http://a.dev и https://b.dev/x?y=1')).toEqual([
      { kind: 'url', url: 'http://a.dev' },
      { kind: 'text', value: ' и ' },
      { kind: 'url', url: 'https://b.dev/x?y=1' },
    ]);
  });

  it('ссылка в тексте рендерится якорем (новая вкладка, noopener)', () => {
    const { container } = render(<MessageText text="чертёж https://example.com/draw.pdf смотри" />);
    const anchor = container.querySelector('a[href="https://example.com/draw.pdf"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchor?.textContent).toBe('https://example.com/draw.pdf');
  });

  it('упоминание и ссылка в одном тексте: чип + якорь рядом', () => {
    const { container } = render(
      <MessageText text="@[Борис](user:11111111-1111-4111-8111-111111111111) глянь https://a.dev" />,
    );
    expect(container.querySelector('button')?.textContent).toBe('Борис');
    expect(container.querySelector('a[href="https://a.dev"]')).not.toBeNull();
  });
});
