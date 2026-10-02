// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BubbleOutline } from './bubble-outline.js';

afterEach(cleanup);

/**
 * #187 (репро: чат из центра уведомлений): заливка/кольцо пузыря — ЕДИНЫЙ
 * SVG-слой; его геометрия обязана браться из clientWidth/clientHeight
 * (layout-px интерфейса Element, НЕ зависят от трансформа предка; у SVG
 * offsetWidth в Chromium отсутствует). getBoundingClientRect во время
 * FLIP-раскрытия карточки масштабирован (transform: scale), а
 * ResizeObserver после анимации не перезапускается (трансформ предка не
 * меняет border-box элемента) — замер в кадре анимации навсегда схлопывал
 * заливку пузыря («время вне пузыря» при верной раскладке).
 */
describe('BubbleOutline — геометрия слоя иммунна к трансформу предка (#187)', () => {
  it('берёт размеры из client*, а не из масштабированного rect', () => {
    const proto = window.Element.prototype as unknown as Record<string, unknown>;
    // FLIP-кадр: rect «схлопнут» (например, scale 0.4), client* — финальные.
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
    Object.defineProperty(proto, 'clientWidth', desc(600));
    Object.defineProperty(proto, 'clientHeight', desc(476));
    try {
      const { container } = render(<BubbleOutline side={null} variant="card" />);
      const path = container.querySelector('path');
      expect(path).toBeTruthy();
      const d = path!.getAttribute('d') ?? '';
      // коробка 600×476 из client* (замер rect 240×80 не должен схлопнуть слой)
      expect(d).toContain('600');
      expect(d).toContain('476');
      expect(rectSpy).not.toHaveBeenCalled();
    } finally {
      delete proto.getBoundingClientRect;
      delete proto.clientWidth;
      delete proto.clientHeight;
    }
  });
});
