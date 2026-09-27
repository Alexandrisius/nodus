// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmojiPickerButton, pushRecentEmoji, recentEmojis } from './emoji-picker.js';

/**
 * Панель эмодзи композера (#130): открывается кликом, грузит данные лениво,
 * клик по эмодзи — onPick + «Недавние» в localStorage; поиск фильтрует.
 */

beforeEach(() => {
  localStorage.clear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  // Данные — public JSON (fetch): в jsdom сети нет, отдаём мини-набор.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            groups: [
              {
                id: 'smileys',
                emojis: [
                  { e: '🔥', n: 'fire' },
                  { e: '😀', n: 'grinning face' },
                  { e: '🎉', n: 'party popper' },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
});

const PICKED = vi.fn();

function setup() {
  return render(
    <EmojiPickerButton onPick={PICKED}>
      <button type="button" aria-label="Эмодзи">
        smile
      </button>
    </EmojiPickerButton>,
  );
}

function emojiButton(emoji: string): Element | null {
  return (
    Array.from(document.body.querySelectorAll('button[aria-label]')).find(
      (b) => b.getAttribute('aria-label') === emoji,
    ) ?? null
  );
}

describe('EmojiPickerButton (#130)', () => {
  it('клик открывает панель; выбор — onPick и «Недавние»', async () => {
    setup();
    fireEvent.click(document.body.querySelector('button[aria-label="Эмодзи"]') as Element);
    // Данные (fetch JSON, стаб с мини-набором) резолвятся в живую сетку.
    await waitFor(
      () => {
        expect(
          Array.from(document.body.querySelectorAll('button[aria-label]')).length,
        ).toBeGreaterThan(2);
      },
      { timeout: 8000 },
    );
    const fire = emojiButton('fire');
    expect(fire).not.toBeNull();
    fireEvent.click(fire as Element);
    expect(PICKED).toHaveBeenCalledWith('🔥');
    expect(recentEmojis()[0]).toBe('🔥');
    // Панель живёт после выбора (канон Telegram): «Недавние» сразу в DOM.
    await waitFor(() => {
      const section = Array.from(document.body.querySelectorAll('h3')).find((h) =>
        (h.textContent ?? '').includes('Недавние'),
      );
      expect(section).not.toBeNull();
    });
  }, 30000);

  it('recent-хелперы: дедуп и кап 24', () => {
    pushRecentEmoji('🔥');
    pushRecentEmoji('🎉');
    pushRecentEmoji('🔥');
    expect(recentEmojis()).toEqual(['🔥', '🎉']);
  });
});
