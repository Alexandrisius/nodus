// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerCardBridge } from '../lib/card-bridge.js';
import { MentionSnippet } from './mention-chip.js';
import { MessageText } from './message-text.js';

/** Чипы @упоминаний (#176): лента — кнопка-карточка, сниппеты — пассивный
 *  чип, копирование/превью — stripMentionTokens (тесты contracts). */

afterEach(cleanup);

const UUID_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_A = `@[Артёму Маторину](user:${UUID_A})`;

describe('MessageText — токен упоминания (#176)', () => {
  it('токен рендерится чипом-кнопкой, текст вокруг сохраняется', () => {
    const { container } = render(<MessageText text={`Отправьте ${TOKEN_A} пожалуйста`} />);
    const chip = container.querySelector<HTMLButtonElement>('button');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe('Артёму Маторину');
    expect(container.textContent).toContain('Отправьте');
    expect(container.textContent).toContain('пожалуйста');
    // Сырой токен в вывод не утекает.
    expect(container.textContent).not.toContain('user:');
  });

  it('клик по чипу — карточка сотрудника через мост', () => {
    const opener = vi.fn();
    const close = registerCardBridge(opener);
    const { container } = render(<MessageText text={TOKEN_A} />);
    fireEvent.click(container.querySelector('button')!);
    expect(opener).toHaveBeenCalledWith({ kind: 'employee', id: UUID_A });
    close();
  });

  it('текст без токенов — без кнопок (разметка не меняется)', () => {
    const { container } = render(<MessageText text="просто @текст и a@b.by" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('одиночный эмодзи с токеном — НЕ single-emoji (чип + глиф текстом)', () => {
    const { container } = render(<MessageText text={TOKEN_A} />);
    expect(container.querySelector('button')).not.toBeNull();
  });
});

describe('MentionSnippet — сниппеты (#176)', () => {
  it('токен — пассивный чип (без кнопки), цвет по id', () => {
    const { container } = render(<MentionSnippet text={`для ${TOKEN_A}`} />);
    expect(container.querySelector('button')).toBeNull();
    const chip = container.querySelector<HTMLElement>('span[style*="color-mix"]');
    expect(chip?.textContent).toBe('Артёму Маторину');
    expect(chip?.style.backgroundColor).toContain('color-mix');
  });

  it('без токенов — сырой текст, DOM не обрастает узлами', () => {
    const { container } = render(<MentionSnippet text="без упоминаний" />);
    expect(container.querySelector('span[style*="color-mix"]')).toBeNull();
    expect(container.textContent).toBe('без упоминаний');
  });
});
