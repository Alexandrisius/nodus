import { describe, expect, it } from 'vitest';

import {
  parallelIndex,
  roundedOrthPath,
  routeTransition,
  type RoutePoint,
} from './edge-routing.js';
import { ROUTE_GEOMETRY } from './route-layout.js';

const entry = (x: number, y: number, layer: number) => ({ x, y, layer });

const STAGE = ROUTE_GEOMETRY.stageWidth;
const ROW = ROUTE_GEOMETRY.stageHeight + ROUTE_GEOMETRY.rowGap;

describe('edge-routing: рёбра не пересекают карточки (#378)', () => {
  it('соседний слой вперёд: правый порт → коридор → левый порт, подпись в коридоре', () => {
    const from = entry(0, 100, 0);
    const to = entry(STAGE + ROUTE_GEOMETRY.layerGap, 300, 1);
    const route = routeTransition(from, to, 0, 1000);
    expect(route.sourceHandle).toBe('r');
    expect(route.targetHandle).toBe('l');
    const [s, elbowA, elbowB, t] = route.points as [RoutePoint, RoutePoint, RoutePoint, RoutePoint];
    // Вертикальный участок — строго в коридоре между слоями.
    expect(elbowA.x).toBe(elbowB.x);
    expect(elbowA.x).toBeGreaterThan(STAGE);
    expect(elbowA.x).toBeLessThan(STAGE + ROUTE_GEOMETRY.layerGap);
    // Подпись — на вертикальном участке.
    expect(route.label.x).toBe(elbowA.x);
    expect(route.label.y).toBe((s.y + t.y) / 2);
  });

  it('параллельные кнопки одной пары расходятся коридорами с шагом', () => {
    const from = entry(0, 100, 0);
    const to = entry(STAGE + ROUTE_GEOMETRY.layerGap, 100, 1);
    const first = routeTransition(from, to, 0, 1000);
    // Единственная кнопка одного ряда — прямая.
    expect(first.points).toHaveLength(2);
    const second = routeTransition(from, to, 1, 1000);
    const third = routeTransition(from, to, 2, 1000);
    expect(third.points[1]!.x - second.points[1]!.x).toBe(22);
  });

  it('возврат назад — нижней магистралью под схемой, подпись на магистрали', () => {
    const from = entry(STAGE + ROUTE_GEOMETRY.layerGap, 100, 1);
    const to = entry(0, 100, 0);
    const laneY = 600;
    const route = routeTransition(from, to, 0, laneY);
    expect(route.sourceHandle).toBe('b');
    expect(route.targetHandle).toBe('b');
    const ys = route.points.map((p) => p.y);
    expect(Math.max(...ys)).toBe(laneY);
    expect(route.label.y).toBe(laneY);
    // Магистраль ниже любой карточки.
    expect(laneY).toBeGreaterThan(100 + ROUTE_GEOMETRY.stageHeight);
  });

  it('дальний ход через слой — тоже магистралью', () => {
    const from = entry(0, 100, 0);
    const to = entry(2 * (STAGE + ROUTE_GEOMETRY.layerGap), 100, 2);
    const route = routeTransition(from, to, 0, 600);
    expect(route.sourceHandle).toBe('b');
    expect(route.targetHandle).toBe('b');
  });

  it('вниз в своём слое — вертикально низ→верх, подпись между карточками', () => {
    const from = entry(0, 0, 1);
    const to = entry(0, ROW, 1);
    const route = routeTransition(from, to, 0, 600);
    expect(route.sourceHandle).toBe('b');
    expect(route.targetHandle).toBe('t');
    const [s, t] = route.points as [RoutePoint, RoutePoint];
    expect(s.x).toBe(t.x);
    expect(route.label.y).toBeGreaterThan(ROUTE_GEOMETRY.stageHeight);
    expect(route.label.y).toBeLessThan(ROW);
  });

  it('вверх в своём слое — правым обходом', () => {
    const from = entry(0, ROW, 1);
    const to = entry(0, 0, 1);
    const route = routeTransition(from, to, 0, 600);
    expect(route.sourceHandle).toBe('r');
    expect(route.targetHandle).toBe('r');
    const elbowX = route.points[1]!.x;
    expect(elbowX).toBeGreaterThan(STAGE);
  });

  it('roundedOrthPath: прямые сегменты и сглаженные углы', () => {
    const d = roundedOrthPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('Q');
    expect(d.endsWith('L 100 100')).toBe(true);
    // Вырожденные случаи не падают.
    expect(roundedOrthPath([{ x: 0, y: 0 }])).toBe('');
  });

  it('parallelIndex — порядковый номер среди параллельных той же пары', () => {
    const edges = [
      { id: '1', fromId: 'a', toId: 'b' },
      { id: '2', fromId: 'a', toId: 'b' },
      { id: '3', fromId: 'a', toId: 'c' },
    ];
    expect(parallelIndex(edges, '1')).toBe(0);
    expect(parallelIndex(edges, '2')).toBe(1);
    expect(parallelIndex(edges, '3')).toBe(0);
  });
});
