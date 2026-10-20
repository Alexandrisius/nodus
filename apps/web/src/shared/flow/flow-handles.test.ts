import { describe, expect, it } from 'vitest';

import { assignHandles, autoSides, handleRatio, handleSide, slotsFor } from './flow-handles.js';

const box = (x: number, y: number) => ({ x, y, w: 208, h: 52 });

describe('flow-handles: точки подключения статуса (#378)', () => {
  it('id точки → сторона и доля стороны', () => {
    expect(handleSide('r3')).toBe('r');
    expect(handleSide('t1')).toBe('t');
    expect(handleRatio('b1')).toBe(0.25);
    expect(handleRatio('l2')).toBe(0.5);
    expect(handleRatio('t3')).toBe(0.75);
  });

  it('стороны: вперёд r→l, назад U снизу, по вертикали b→t / t→b', () => {
    expect(autoSides(box(0, 0), box(400, 0))).toEqual(['r', 'l']);
    expect(autoSides(box(400, 0), box(0, 0))).toEqual(['b', 'b']);
    expect(autoSides(box(0, 0), box(0, 120))).toEqual(['b', 't']);
    expect(autoSides(box(0, 120), box(0, 0))).toEqual(['t', 'b']);
  });

  it('вперёд через занятый коридор — U снизу, а не сквозь соседа', () => {
    expect(autoSides(box(0, 0), box(800, 0), [box(400, 0)])).toEqual(['b', 'b']);
    expect(autoSides(box(0, 0), box(800, 0), [box(400, 200)])).toEqual(['r', 'l']);
  });

  it('слоты по стороне: 1 — центр, 2 — края, 3 — все', () => {
    expect(slotsFor(1)).toEqual([2]);
    expect(slotsFor(2)).toEqual([1, 3]);
    expect(slotsFor(3)).toEqual([1, 2, 3]);
    expect(slotsFor(5)).toHaveLength(5);
  });

  it('раздача: сохранённые точки — закон, остальные — по порядку вторых концов', () => {
    const boxes = new Map([
      ['a', box(0, 100)],
      ['up', box(400, 0)],
      ['down', box(400, 200)],
      ['c', box(800, 100)],
    ]);
    const handles = assignHandles(
      [
        { id: 'e-down', source: 'a', target: 'down' },
        { id: 'e-up', source: 'a', target: 'up' },
        { id: 'e-fixed', source: 'up', target: 'c', sourceHandle: 't3', targetHandle: 't1' },
      ],
      boxes,
    );
    // Верхний сосед — к верхней точке правой стороны, нижний — к нижней.
    expect(handles.get('e-up')).toEqual({ sourceHandle: 'r1', targetHandle: 'l2' });
    expect(handles.get('e-down')).toEqual({ sourceHandle: 'r3', targetHandle: 'l2' });
    expect(handles.get('e-fixed')).toEqual({ sourceHandle: 't3', targetHandle: 't1' });
  });
});
