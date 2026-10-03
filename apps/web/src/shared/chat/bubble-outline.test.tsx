// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BubbleOutline } from './bubble-outline.js';

afterEach(cleanup);

/**
 * #187 (репро: чат из центра уведомлений): заливка/кольцо пузыря — ЕДИНЫЙ
 * SVG-слой; его геометрия обязана браться из getComputedStyle().width/height
 * (ДРОБНЫЕ layout-px: не искажаются трансформом предка — в отличие от rect;
 * и не округляются до целого — в отличие от clientWidth, чей ±0.5px дрейф
 * оставлял щели/дуги у full-bleed картинок, раунд 2 п.6).
 * getBoundingClientRect во время FLIP-раскрытия карточки масштабирован, а
 * ResizeObserver после анимации не перезапускается — замер в кадре анимации
 * навсегда схлопывал заливку пузыря.
 */
describe('BubbleOutline — геометрия слоя иммунна к трансформу предка (#187)', () => {
  it('берёт размеры из computed style, а не из масштабированного rect', () => {
    const proto = window.Element.prototype as unknown as Record<string, unknown>;
    // FLIP-кадр: rect «схлопнут» (например, scale 0.4), computed — финальные.
    const rectSpy = vi.fn(() => ({
      top: 0,
      left: 0,
      right: 240,
      bottom: 80,
      width: 240,
      height: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    const desc = (value: unknown) => ({ value, configurable: true });
    Object.defineProperty(proto, 'getBoundingClientRect', desc(rectSpy));
    const realGCS = window.getComputedStyle;
    vi.stubGlobal(
      'getComputedStyle',
      vi.fn(() => ({ width: '600px', height: '476px' }) as CSSStyleDeclaration),
    );
    try {
      const { container } = render(<BubbleOutline side={null} variant="card" />);
      const path = container.querySelector('path');
      expect(path).toBeTruthy();
      const d = path!.getAttribute('d') ?? '';
      // коробка 600×476 из computed (замер rect 240×80 не должен схлопнуть слой)
      expect(d).toContain('600');
      expect(d).toContain('476');
      expect(rectSpy).not.toHaveBeenCalled();
    } finally {
      delete proto.getBoundingClientRect;
      vi.unstubAllGlobals();
      void realGCS;
    }
  });
});
