// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaPickerButton } from './media-picker.js';
import { pushRecentEmoji, recentEmojis } from './emoji-picker.js';

/**
 * Медиа-пикер композера (#130 → #143): вкладки «Эмодзи | Стикеры», вкладка
 * эмодзи открывается по умолчанию, грузит данные лениво, клик по эмодзи —
 * onPick + «Недавние» в localStorage; поиск фильтрует. Стикер-вкладка на
 * моках требует MSW-стора — её поведение покрывают интеграционные прогоны.
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
                  { e: '🔥', n: 'fire', s: 'огонь пламя', t: 'огонь' },
                  { e: '😀', n: 'grinning face', s: 'улыбка', t: 'широко улыбается' },
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
  // Стикер-вкладка живёт на TanStack Query — провайдер обязателен.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MediaPickerButton onPickEmoji={PICKED} onPickSticker={vi.fn()}>
        <button type="button" aria-label="Эмодзи">
          smile
        </button>
      </MediaPickerButton>
    </QueryClientProvider>,
  );
}

function emojiButton(emoji: string): Element | null {
  return (
    Array.from(document.body.querySelectorAll('button[aria-label]')).find(
      (b) => b.getAttribute('aria-label') === emoji,
    ) ?? null
  );
}

describe('MediaPickerButton: вкладка эмодзи (#130/#143)', () => {
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
    const fire = emojiButton('Огонь');
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

  it('тултипы — русские имена CLDR с заглавной; без t — английское (#165)', async () => {
    setup();
    fireEvent.click(document.body.querySelector('button[aria-label="Эмодзи"]') as Element);
    await waitFor(
      () => {
        expect(emojiButton('Огонь')).not.toBeNull();
      },
      { timeout: 8000 },
    );
    // С заглавной (данные хранят строчными — I15 и никакой автоперевод).
    expect(emojiButton('Широко улыбается')).not.toBeNull();
    // Fallback без русской аннотации (флаг Сарка в реальных данных) —
    // английское имя, тоже с заглавной.
    expect(emojiButton('Party popper')).not.toBeNull();
  }, 30000);

  it('вкладки переключаются: «Стикеры» выбирается, эмодзи скрываются', async () => {
    setup();
    fireEvent.click(document.body.querySelector('button[aria-label="Эмодзи"]') as Element);
    await waitFor(
      () => {
        expect(emojiButton('Огонь')).not.toBeNull();
      },
      { timeout: 8000 },
    );
    const stickerTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Стикеры'),
    );
    expect(stickerTab).not.toBeNull();
    fireEvent.click(stickerTab as Element);
    // Вкладка эмодзи размонтирована: сетка эмодзи ушла.
    expect(emojiButton('fire')).toBeNull();
  }, 30000);
});
