// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageRow } from './message-row.js';

/**
 * Выделение только цветом (#151, вердикт владельца 29.09): чекбоксов и
 * сдвига пузырей (pl-7 + transition) больше нет — строка несёт только
 * data-selected (тинт — глобальный CSS) и клик-перехват в capture-фазе.
 * Анимационный reflow каждого пузыря исключён — то, что лагало у пилотов.
 */

afterEach(cleanup);

describe('MessageRow — выделение цветом без чекбоксов (#151)', () => {
  it('вне режима: нет чекбокса и нет обёртки-сдвига, data-selected не проставлен', () => {
    const { container } = render(
      <MessageRow messageId="m1">
        <span>текст</span>
      </MessageRow>,
    );
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    const row = container.querySelector('[data-message-id]')!;
    expect(row.getAttribute('data-selected')).toBeNull();
    // Дети — напрямую в строке, без transition-обёртки pl-7
    expect(row.querySelector(':scope > div.transition-\\[padding-left\\]')).toBeNull();
  });

  it('в режиме: data-selected красит строку, клик тогглит с Shift-флагом', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <MessageRow messageId="m1" selectable selected onToggle={onToggle}>
        <span>текст</span>
      </MessageRow>,
    );
    const row = container.querySelector('[data-message-id]')!;
    expect(row.getAttribute('data-selected')).toBe('true');
    expect(container.querySelector('[role="checkbox"]')).toBeNull();

    fireEvent.click(row, { shiftKey: true });
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('вне режима клик по строке не перехватывается', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <MessageRow messageId="m1" onToggle={onToggle}>
        <span>текст</span>
      </MessageRow>,
    );
    fireEvent.click(container.querySelector('[data-message-id]')!);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
