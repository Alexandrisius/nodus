import { describe, expect, it } from 'vitest';

import { edgePath, labelBoxAt, labelCost, labelWidth, placeLabel } from './route-labels.js';

const box = (x: number, y = 0) => ({ x, y, w: 208, h: 52 });

describe('route-labels: подписи на своих стрелках (#378 ред. 2)', () => {
  it('путь стрелки — от внешнего края кружка точки до кружка цели', () => {
    const points = edgePath(box(0), 'r2', box(400), 'l2', { offset: 24, shift: 0 });
    expect(points[0]).toEqual({ x: 211.5, y: 26 });
    expect(points.at(-1)).toEqual({ x: 396.5, y: 26 });
  });

  it('свободная середина — подпись в середине стрелки', () => {
    const points = edgePath(box(0), 'r2', box(400), 'l2', { offset: 24, shift: 0 });
    expect(placeLabel(points, labelWidth('Взять в работу'), [box(0), box(400)])).toBe(0.5);
  });

  it('занятая середина — ближайшее свободное место той же стрелки', () => {
    const points = edgePath(box(0), 'r2', box(600), 'l2', { offset: 24, shift: 0 });
    const width = labelWidth('Завершить');
    const blocker = labelBoxAt(points, 0.5, width);
    const at = placeLabel(points, width, [box(0), box(600), blocker]);
    expect(at).not.toBe(0.5);
    expect(labelCost(labelBoxAt(points, at, width), [blocker])).toBe(0);
  });

  it('место, куда подпись поставили, держится, пока свободно', () => {
    const points = edgePath(box(0), 'r2', box(600), 'l2', { offset: 24, shift: 0 });
    expect(placeLabel(points, 80, [box(0), box(600)], 0.3)).toBe(0.3);
  });
});
