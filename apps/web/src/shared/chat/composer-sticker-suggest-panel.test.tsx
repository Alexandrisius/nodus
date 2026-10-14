// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ui } from '@nodus/contracts';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../api-client.js', () => ({ api: apiMock, apiUpload: vi.fn() }));

import { ChatComposer } from './chat-composer.js';
import type { ComposerSubmit } from './composer-submit.js';
import { useChatDrafts } from './chat-drafts.js';

/** Плашка стикеров-подсказок при вводе соло-эмодзи (#294): соло-эмодзи
 *  открывает ряд совпадений, клик отправляет стикер и стирает эмодзи;
 *  текст/второй эмодзи закрывают; Enter без подсветки — сообщение,
 *  стрелки+Enter — стикер; Esc прячет до смены эмодзи. */

const CONV = '33333333-3333-4333-8333-333333333333';
const CORP = '11111111-1111-4111-8111-111111111111';
const PERSONAL = '22222222-2222-4222-8222-222222222222';
const S_CORP = 'aaaaaaaa-0000-4000-8000-000000000001';
const S_PERS = 'aaaaaaaa-0000-4000-8000-000000000002';
const S_OTHER = 'aaaaaaaa-0000-4000-8000-000000000003';

const PACKS = {
  items: [
    {
      id: CORP,
      title: 'Nodus',
      scope: 'corporate',
      owned: false,
      installed: true,
      stickers: [
        {
          id: S_CORP,
          packId: CORP,
          emojis: ['🙂'],
          url: '/s/corp.png',
          mime: 'image/png',
          size: 1,
          width: 512,
          height: 512,
        },
        {
          id: S_OTHER,
          packId: CORP,
          emojis: ['🚀'],
          url: '/s/other.png',
          mime: 'image/png',
          size: 1,
          width: 512,
          height: 512,
        },
      ],
    },
    {
      id: PERSONAL,
      title: 'Мемы',
      scope: 'personal',
      owned: true,
      installed: true,
      stickers: [
        {
          id: S_PERS,
          packId: PERSONAL,
          emojis: ['🙂'],
          url: '/s/pers.png',
          mime: 'image/png',
          size: 1,
          width: 512,
          height: 512,
        },
      ],
    },
  ],
};

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

beforeAll(() => {
  // jsdom не реализует scrollIntoView (подсветка стрелками проматывает ряд).
  Element.prototype.scrollIntoView = vi.fn();
});

/** Пустой черновик стор вырезает (patchDraft→prune) — «текст пуст» = нет записи. */
function draftText(): string {
  return useChatDrafts.getState().drafts[`conversation:${CONV}`]?.text ?? '';
}

const STRIP = `[role="listbox"][aria-label="${ui.chat.stickerSuggestLabel}"]`;

function mountComposer(onSubmit: (s: ComposerSubmit) => void, stickersEnabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  apiMock.mockImplementation((url: string) => {
    if (String(url).includes('/chat/stickers/packs')) return Promise.resolve(PACKS);
    return Promise.resolve({ items: [], nextCursor: null });
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ChatComposer, {
        placeholder: 'Поле',
        focusId: `conversation:${CONV}`,
        conversationId: CONV,
        stickersEnabled,
        onSubmit,
      }),
    ),
  );
}

function typeEmoji(view: ReturnType<typeof render>, value: string) {
  const field = view.container.querySelector('textarea')!;
  fireEvent.change(field, { target: { value } });
  field.setSelectionRange(value.length, value.length);
  fireEvent.keyUp(field, { key: 'е' });
  return field;
}

async function waitStrip(view: ReturnType<typeof render>) {
  return waitFor(() => {
    const strip = view.container.querySelector<HTMLElement>(STRIP);
    if (!strip) throw new Error('strip not rendered');
    return strip;
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  useChatDrafts.setState({ drafts: {} });
});

describe('плашка стикеров при вводе соло-эмодзи (#294)', () => {
  it('соло-эмодзи открывает плашку; клик отправляет стикер и стирает эмодзи', async () => {
    const submitted: ComposerSubmit[] = [];
    const view = mountComposer((s) => submitted.push(s));
    typeEmoji(view, '🙂');

    const strip = await waitStrip(view);
    // Корпоративный пак первым (канон пикера), личный — вторым; 🚀 не матчится.
    const options = strip.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);

    fireEvent.mouseDown(options[0]!);
    await waitFor(() => {
      expect(submitted).toHaveLength(1);
      expect(submitted[0]!.sticker?.stickerId).toBe(S_CORP);
      expect(submitted[0]!.text).toBe('');
    });
    expect(draftText()).toBe('');
  });

  it('текст или второй эмодзи закрывают плашку', async () => {
    const view = mountComposer(() => {});
    typeEmoji(view, 'привет 🙂');
    await waitFor(() => {
      expect(view.container.querySelector(STRIP)).toBeNull();
    });

    typeEmoji(view, '🙂');
    await waitStrip(view);
    typeEmoji(view, '🙂🙂');
    await waitFor(() => {
      expect(view.container.querySelector(STRIP)).toBeNull();
    });
  });

  it('Enter без подсветки отправляет сообщение; стрелки+Enter — стикер', async () => {
    const submitted: ComposerSubmit[] = [];
    const view = mountComposer((s) => submitted.push(s));
    const field = typeEmoji(view, '🙂');
    await waitStrip(view);

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.text).toBe('🙂');
    expect(submitted[0]!.sticker ?? null).toBeNull();

    // Черновик в тесте чистит хост-мутация — поле не пусто, плашка жива:
    // стрелка подсвечивает первый стикер, Enter выбирает его.
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => {
      expect(submitted).toHaveLength(2);
      expect(submitted[1]!.sticker?.stickerId).toBe(S_CORP);
    });
    expect(draftText()).toBe('');
  });

  it('Esc прячет плашку; смена эмодзи показывает снова', async () => {
    const view = mountComposer(() => {});
    const field = typeEmoji(view, '🙂');
    await waitStrip(view);

    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => {
      expect(view.container.querySelector(STRIP)).toBeNull();
    });

    // Перебор и повторный ввод — новое намерение: плашка возвращается.
    typeEmoji(view, '');
    typeEmoji(view, '🙂');
    await waitStrip(view);
  });

  it('стикеры отключены (task-хост) — плашки нет', async () => {
    const view = mountComposer(() => {}, false);
    typeEmoji(view, '🙂');
    await waitFor(() => {
      expect(view.container.querySelector(STRIP)).toBeNull();
    });
  });
});
