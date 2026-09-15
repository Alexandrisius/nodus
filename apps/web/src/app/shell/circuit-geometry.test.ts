import { describe, expect, it } from 'vitest';
import { snapPx } from '@nodus/ui/components/node-edge';

import type { CircuitGeometry } from './circuit-geometry.js';
import { currentFocus, framePath, transitionPulse, TICK } from './circuit-geometry.js';

/** Базовая геометрия контура: рейка развёрнута, два модуля, две вкладки. */
function geo(overrides: Partial<CircuitGeometry> = {}): CircuitGeometry {
  return {
    junction: { x: 24, y: 64 },
    axisY: 64,
    modules: [
      { to: '/home', active: false, port: { x: 60, y: 100 } },
      { to: '/tasks', active: true, port: { x: 60, y: 140 } },
    ],
    tabs: [
      { active: true, x: 300, label: 'Список' },
      { active: false, x: 420, label: 'Канбан' },
    ],
    leftNode: null,
    rightEdge: 1600,
    axisFull: false,
    terminus: null,
    spineEndY: 300,
    cardMode: false,
    ...overrides,
  };
}

describe('currentFocus', () => {
  it('активные модуль и вкладка; без активного модуля — null', () => {
    const f = currentFocus(geo());
    expect(f?.moduleTo).toBe('/tasks');
    expect(f?.tabLabel).toBe('Список');
    expect(currentFocus(geo({ modules: [] }))).toBeNull();
  });
});

describe('transitionPulse (вспышка контура)', () => {
  it('фокус не сменился — вспышки нет (антимерцание)', () => {
    const g = geo();
    expect(
      transitionPulse(g, { moduleTo: '/tasks', modulePort: { x: 60, y: 140 }, tabLabel: 'Список' }),
    ).toBeNull();
  });

  it('смена модуля/вкладки — пульс от порта модуля до засечки вкладки с точкой', () => {
    const pulse = transitionPulse(geo(), null);
    expect(pulse?.dot).toBe(true);
    const last = pulse?.points.at(-1);
    expect(last?.x).toBe(snapPx(300));
    expect(last?.y).toBe(snapPx(64 - TICK));
  });

  it('Главная без вкладок — пульс до ТЕРМИНАЛЬНОЙ точки (вердикт 15.09.2026)', () => {
    const g = geo({
      modules: [{ to: '/home', active: true, port: { x: 60, y: 100 } }],
      tabs: [],
      terminus: { x: 248, y: 64 },
    });
    const pulse = transitionPulse(g, null);
    expect(pulse?.points.at(-1)).toEqual({ x: snapPx(248), y: snapPx(64) });
  });

  it('Главная без terminus (схлопнутая рейка) — вспышка ЗАПРЕЩЕНА (баг-вердикт 15.09.2026)', () => {
    const g = geo({ modules: [{ to: '/home', active: true, port: { x: 60, y: 100 } }], tabs: [] });
    expect(transitionPulse(g, null)).toBeNull();
  });

  it('смена только вкладки (тот же модуль) — тоже вспышка', () => {
    const g = geo();
    const pulse = transitionPulse(g, {
      moduleTo: '/tasks',
      modulePort: { x: 60, y: 140 },
      tabLabel: 'Другое',
    });
    expect(pulse).not.toBeNull();
  });
});

describe('framePath (путь рамы контура)', () => {
  it('с вкладками: ось заканчивается засечкой последней вкладки (без хвоста)', () => {
    const path = framePath(geo());
    expect(path).toContain(`${snapPx(420)}`);
    expect(path).not.toContain(`${snapPx(1600)}`);
  });

  it('axisFull (мессенджер): ось до правого края рамы', () => {
    const path = framePath(geo({ axisFull: true }));
    expect(path).toContain(`${snapPx(1600)}`);
  });

  it('без вкладок (Главная): связь до terminus на левом краю мягкой области', () => {
    const path = framePath(geo({ tabs: [], terminus: { x: 248, y: 64 } }));
    expect(path).toContain(`${snapPx(248)}`);
  });

  it('порт у самой шины (< 8px) — отвод не рисуется', () => {
    const withFar = framePath(geo());
    const nearOnly = framePath(
      geo({ modules: [{ to: '/home', active: true, port: { x: 26, y: 100 } }], tabs: [] }),
    );
    // У близкого порта отвода нет: путей (M-команд) меньше, чем у полной геометрии.
    const countM = (p: string) => (p.match(/M/g) ?? []).length;
    expect(countM(nearOnly)).toBeLessThan(countM(withFar));
  });
});
