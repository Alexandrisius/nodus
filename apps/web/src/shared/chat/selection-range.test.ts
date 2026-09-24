import { describe, expect, it } from 'vitest';

import { rangeBetween, withSelection } from './selection-range.js';

describe('rangeBetween — Shift+клик диапазон (канон Gmail)', () => {
  const ordered = ['a', 'b', 'c', 'd', 'e'];

  it('вниз от якоря — закрытый интервал', () => {
    expect(rangeBetween(ordered, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('вверх от якоря — тот же интервал (порядок не важен)', () => {
    expect(rangeBetween(ordered, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('якорь = цель — одно сообщение', () => {
    expect(rangeBetween(ordered, 'c', 'c')).toEqual(['c']);
  });

  it('неизвестный id — деградация до цели (диапазон не строится)', () => {
    expect(rangeBetween(ordered, 'x', 'd')).toEqual(['d']);
  });
});

describe('withSelection — лимит 100 (явный, не молчаливый)', () => {
  it('без дублей, порядок текущих сохранён', () => {
    expect(withSelection(['a', 'b'], ['b', 'c']).ids).toEqual(['a', 'b', 'c']);
  });

  it('превышение лимита — обрезка и capped=true (для тоста)', () => {
    const current = Array.from({ length: 99 }, (_, i) => `m${i}`);
    const { ids, capped } = withSelection(current, ['x', 'y']);
    expect(capped).toBe(true);
    expect(ids).toHaveLength(100);
    expect(ids[99]).toBe('x');
  });

  it('свой лимит уважается', () => {
    const { ids, capped } = withSelection(['a'], ['b'], 2);
    expect(ids).toEqual(['a', 'b']);
    expect(capped).toBe(false);
    expect(withSelection(['a', 'b'], ['c'], 2).capped).toBe(true);
  });
});
