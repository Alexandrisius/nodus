// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { isSingleEmoji, MessageText } from './message-text.js';

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
    const span = container.querySelector('span');
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
