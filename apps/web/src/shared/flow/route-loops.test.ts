import { describe, expect, it } from 'vitest';

import { crossesNode, edgeSpread, freeDepth, loopsCollide } from './route-loops.js';

const box = (x: number, y = 0) => ({ x, y, w: 208, h: 52 });
const boxes = new Map([
  ['a', box(0)],
  ['b', box(400)],
  ['c', box(800)],
]);
const inputs = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
];
const handles = new Map([
  ['ab', { sourceHandle: 'b1', targetHandle: 'b1' }],
  ['ac', { sourceHandle: 'b3', targetHandle: 'b3' }],
]);

describe('route-loops: разнос U-обходов (#378 ред. 2)', () => {
  it('новые обходы вкладываются: короткий пролёт внутри, длинный глубже', () => {
    const { spread, loops } = edgeSpread(inputs, handles, boxes, () => undefined);
    expect(loops.size).toBe(2);
    expect(spread.get('ab')!.offset).toBe(24);
    expect(spread.get('ac')!.offset).toBe(40);
  });

  it('сохранённая глубина — закон; новый обход на неё не наезжает', () => {
    const { spread } = edgeSpread(inputs, handles, boxes, (id) => (id === 'ac' ? 24 : undefined));
    expect(spread.get('ac')!.offset).toBe(24);
    expect(spread.get('ab')!.offset).toBe(40);
  });

  it('наложение — по реальной геометрии: другая сторона или далёкая линия не мешают', () => {
    const { loops } = edgeSpread(inputs, handles, boxes, () => undefined);
    const ab = loops.get('ab')!;
    const ac = loops.get('ac')!;
    expect(loopsCollide(ab, 24, ac, 24)).toBe(true);
    expect(loopsCollide(ab, 24, ac, 40)).toBe(false);
    expect(loopsCollide(ab, 24, { ...ac, side: 't' }, 24)).toBe(false);
    expect(loopsCollide(ab, 24, { ...ac, base: ac.base + 300 }, 24)).toBe(false);
  });
});

describe('route-loops: обход не идёт сквозь карточку (#378 ред. 2)', () => {
  it('линия глубины, проходящая через чужой узел, уходит ниже него', () => {
    const loop = { id: 'u', side: 'b' as const, lo: 100, hi: 700, base: 100 };
    // Карточка прямо под пролётом: глубина 24 (линия y=124) прошла бы сквозь неё.
    const blocker = { x: 300, y: 110, w: 208, h: 52 };
    expect(crossesNode(loop, 24, [blocker])).toBe(true);
    const offset = freeDepth(loop, 24, [], [blocker]);
    // Линия ниже карточки с зазором (низ карточки 162 + зазор 10).
    expect(100 + offset).toBeGreaterThanOrEqual(172);
    expect(crossesNode(loop, offset, [blocker])).toBe(false);
  });
});
