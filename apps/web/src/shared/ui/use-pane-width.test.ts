import { describe, expect, it } from 'vitest';

import {
  MIN_THREAD_W,
  THREAD_DEFAULT_W,
  THREAD_MAX_W,
  threadMaxW,
  threadWidth,
} from '../chat/channel-layout.js';
import { clampPaneWidth } from './use-pane-width.js';

describe('clampPaneWidth', () => {
  it('держит границы min/max', () => {
    expect(clampPaneWidth(100, 340, 720)).toBe(340);
    expect(clampPaneWidth(900, 340, 720)).toBe(720);
    expect(clampPaneWidth(500, 340, 720)).toBe(500);
  });

  it('вырожденный контейнер (max < min): min побеждает', () => {
    expect(clampPaneWidth(500, 340, 200)).toBe(340);
  });

  it('запомненная ширина клампится живым пределом контейнера: drag стартует от эффективной ширины без скачка', () => {
    const containerW = 700;
    const maxW = threadMaxW(containerW);
    const clamped = clampPaneWidth(THREAD_DEFAULT_W, MIN_THREAD_W, maxW);
    expect(clamped).toBe(threadWidth(clamped, containerW));
  });

  it('предел не теряет потолок THREAD_MAX_W на широком мониторе', () => {
    expect(threadMaxW(2560)).toBe(THREAD_MAX_W);
  });
});
