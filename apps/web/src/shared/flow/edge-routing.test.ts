import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';

import { EDGE_OFFSET_STEP, parallelIndex, routeEdge, displayEdgeStyle } from './edge-routing.js';

const point = (band: number, index: number) => ({ x: band * 256, y: index * 76, band, index });

describe('edge-routing: порты и обходы (#378)', () => {
  it('в колонку правее — правый порт → левый порт, без выноса', () => {
    expect(routeEdge(point(0, 0), point(1, 0), 0)).toEqual({
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      offset: 0,
    });
  });

  it('возврат влево — U под узлами (низ → низ) с шагом отступа', () => {
    const first = routeEdge(point(1, 0), point(0, 0), 0);
    expect(first.sourcePosition).toBe(Position.Bottom);
    expect(first.targetPosition).toBe(Position.Bottom);
    expect(first.offset).toBe(EDGE_OFFSET_STEP);
    expect(routeEdge(point(1, 0), point(0, 0), 2).offset).toBe(EDGE_OFFSET_STEP * 3);
  });

  it('вниз в колонке — низ → верх', () => {
    const r = routeEdge(point(0, 0), point(0, 2), 0);
    expect(r).toEqual({ sourcePosition: Position.Bottom, targetPosition: Position.Top, offset: 0 });
  });

  it('вверх в колонке — правый → правый с C-обходом', () => {
    const r = routeEdge(point(0, 2), point(0, 0), 1);
    expect(r.sourcePosition).toBe(Position.Right);
    expect(r.targetPosition).toBe(Position.Right);
    expect(r.offset).toBe(EDGE_OFFSET_STEP * 2);
  });

  it('параллельный индекс считается в своей паре колонок', () => {
    const edges = [
      { id: 'e1', fromBand: 1, toBand: 0 },
      { id: 'e2', fromBand: 1, toBand: 0 },
      { id: 'e3', fromBand: 0, toBand: 1 },
    ];
    expect(parallelIndex(edges, 'e1')).toBe(0);
    expect(parallelIndex(edges, 'e2')).toBe(1);
    expect(parallelIndex(edges, 'e3')).toBe(0);
  });

  it('вид линии по показу: «в Ещё» — пунктир', () => {
    expect(displayEdgeStyle('primary').dashed).toBe(false);
    expect(displayEdgeStyle('button').dashed).toBe(false);
    expect(displayEdgeStyle('menu').dashed).toBe(true);
  });
});
