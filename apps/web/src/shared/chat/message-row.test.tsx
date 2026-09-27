// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageRow } from './message-row.js';

/**
 * Плавность мультселекта (#124): колонка чекбокса всегда в DOM, вход/выход
 * режима — transition padding-left ленты + opacity/scale чекбокса (220 мс);
 * вне режима чекбокс скрыт от кликов и AT.
 */

afterEach(cleanup);

describe('MessageRow — анимированная колонка селекта (#124)', () => {
  it('вне режима: чекбокс в DOM, но скрыт и не кликабелен; лента без отступа', () => {
    const { container } = render(
      <MessageRow messageId="m1">
        <span>текст</span>
      </MessageRow>,
    );
    const box = container.querySelector('[role="checkbox"]')?.closest('span');
    expect(box).not.toBeNull();
    expect(box?.className).toContain('pointer-events-none');
    expect(box?.className).toContain('opacity-0');
    expect(box?.getAttribute('aria-hidden')).toBe('true');
    const content = container.querySelector('[data-message-id] > div');
    expect(content?.className).toContain('pl-0');
    expect(content?.className).toContain('transition-[padding-left]');
  });

  it('в режиме: чекбокс видим, лента с отступом под колонку', () => {
    const { container } = render(
      <MessageRow messageId="m1" selectable selected>
        <span>текст</span>
      </MessageRow>,
    );
    const box = container.querySelector('[role="checkbox"]')?.closest('span');
    expect(box?.className).toContain('opacity-100');
    expect(box?.className).not.toContain('pointer-events-none');
    expect(box?.getAttribute('aria-hidden')).toBeNull();
    const content = container.querySelector('[data-message-id] > div');
    expect(content?.className).toContain('pl-7');
  });
});
