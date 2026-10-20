import { describe, expect, it } from 'vitest';

import { orthogonalPoints, pointAt, projectT, roundedPath, simplify } from './edge-geometry.js';

describe('edge-geometry: ортогональные рёбра холста (#378)', () => {
  it('соосные встречные концы — одна прямая', () => {
    expect(orthogonalPoints({ x: 208, y: 26 }, 'r', { x: 400, y: 26 }, 'l')).toEqual([
      { x: 208, y: 26 },
      { x: 400, y: 26 },
    ]);
    expect(orthogonalPoints({ x: 104, y: 52 }, 'b', { x: 104, y: 180 }, 't')).toHaveLength(2);
  });

  it('встречные стороны со сдвигом — Z с изломом посередине', () => {
    const points = orthogonalPoints({ x: 208, y: 26 }, 'r', { x: 384, y: 142 }, 'l');
    expect(points).toEqual([
      { x: 208, y: 26 },
      { x: 296, y: 26 },
      { x: 296, y: 142 },
      { x: 384, y: 142 },
    ]);
  });

  it('параллельные кнопки пары расходятся сдвигом середины', () => {
    const a = orthogonalPoints({ x: 0, y: 0 }, 'r', { x: 200, y: 100 }, 'l', { shift: -8 });
    const b = orthogonalPoints({ x: 0, y: 0 }, 'r', { x: 200, y: 100 }, 'l', { shift: 8 });
    expect(a[1]!.x).toBe(92);
    expect(b[1]!.x).toBe(108);
  });

  it('одна сторона — U без общей магистрали: глубина растёт с offset', () => {
    const near = orthogonalPoints({ x: 500, y: 52 }, 'b', { x: 100, y: 52 }, 'b', { offset: 24 });
    const far = orthogonalPoints({ x: 600, y: 52 }, 'b', { x: 50, y: 52 }, 'b', { offset: 40 });
    expect(near).toEqual([
      { x: 500, y: 52 },
      { x: 500, y: 76 },
      { x: 100, y: 76 },
      { x: 100, y: 52 },
    ]);
    expect(far[1]!.y).toBe(92);
    // Концы на разной высоте: U уходит ниже дальнего.
    const uneven = orthogonalPoints({ x: 500, y: 52 }, 'b', { x: 100, y: 160 }, 'b');
    expect(uneven[1]!.y).toBe(184);
  });

  it('цель позади источника — обход ниже обоих концов, не сквозь узлы', () => {
    const points = orthogonalPoints({ x: 500, y: 26 }, 'r', { x: 0, y: 26 }, 'l');
    expect(Math.max(...points.map((p) => p.y))).toBe(78);
    expect(points[0]).toEqual({ x: 500, y: 26 });
    expect(points.at(-1)).toEqual({ x: 0, y: 26 });
  });

  it('смешанные стороны — угол (метка «Любой статус» над статусом)', () => {
    expect(orthogonalPoints({ x: 100, y: 20 }, 'r', { x: 300, y: 100 }, 't')).toEqual([
      { x: 100, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 100 },
    ]);
  });

  it('simplify убирает повторы и точки посреди прямой', () => {
    expect(
      simplify([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
    ]);
  });

  it('pointAt: t = 0.5 — середина по длине; projectT возвращает t', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(pointAt(points, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAt(points, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAt(points, 1)).toEqual({ x: 100, y: 100 });
    expect(projectT(points, { x: 50, y: 12 })).toBeCloseTo(0.25);
    expect(projectT(points, { x: 140, y: 150 })).toBe(1);
    expect(projectT(points, pointAt(points, 0.7))).toBeCloseTo(0.7);
  });

  it('roundedPath: мягкие локти, прямая — без кривых', () => {
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M 0 0 L 10 0');
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toContain('Q 100 0');
  });
});
