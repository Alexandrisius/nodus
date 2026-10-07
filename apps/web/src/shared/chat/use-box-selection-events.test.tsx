// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useBoxSelection } from './use-box-selection.js';

/** Событийная обвязка рамочного выделения: механика #242 (вердикт 07.10) —
 *  pointercancel браузера = старт НАТИВНОГО драга (тянут картинку сообщения):
 *  синтетического click после него не будет, и заряжённый глотатель съедал
 *  первый легитимный клик (крестик островка селекта ждал два нажатия). */
function Harness({ scope }: { scope: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useBoxSelection({ scope, viewportRef: ref, selectableIds: ['m1'], selectionActive: false });
  return (
    <div ref={ref} data-testid="vp">
      <div data-message-id="m1" data-message-key="m1">
        строка
      </div>
    </div>
  );
}

function pointer(type: string, x: number, y: number) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
}

/** jsdom: clientWidth/Height нулевые — гвард «не скроллбар» выкидывал бы
 *  любой pointerdown с положительными координатами. */
function stubViewportSize() {
  const vp = document.querySelector('[data-testid="vp"]') as HTMLDivElement;
  Object.defineProperty(vp, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(vp, 'clientHeight', { value: 800, configurable: true });
  return vp;
}

describe('useBoxSelection — события (#242)', () => {
  afterEach(cleanup);

  function engage(vp: HTMLElement) {
    vp.dispatchEvent(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointermove', 30, 40));
  }

  it('pointercancel (нативный драг): выделение фиксируется, клик НЕ глотается', () => {
    render(<Harness scope="box-events-drag" />);
    const vp = stubViewportSize();
    engage(vp);

    window.dispatchEvent(new Event('pointercancel'));

    // Глотатель НЕ заряжён: следующий клик (крестик островка) проходит.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('pointerup (штатное завершение протяжки): клик-продолжение глотается как раньше', () => {
    render(<Harness scope="box-events-up" />);
    const vp = stubViewportSize();
    engage(vp);

    window.dispatchEvent(new Event('pointerup'));

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});
