import { describe, expect, it } from 'vitest';

import { sortRows } from './sort-rows.js';

interface Row {
  id: string;
  name: string | null;
  size: number | null;
}

const defs = [
  { id: 'name', sortValue: (r: Row) => r.name },
  { id: 'size', sortValue: (r: Row) => r.size },
  { id: 'noSort' },
];

const row = (id: string, name: string | null, size: number | null): Row => ({ id, name, size });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('sortRows (концепт #4, клиентская сортировка)', () => {
  it('без активной сортировки — исходный массив без копии', () => {
    const rows = [row('b', 'b', 2), row('a', 'a', 1)];
    expect(sortRows(rows, undefined, defs, (r) => r.id)).toBe(rows);
  });

  it('поле без sortValue / неизвестное поле — исходный порядок', () => {
    const rows = [row('b', 'b', 2), row('a', 'a', 1)];
    expect(ids(sortRows(rows, { field: 'noSort', dir: 'asc' }, defs, (r) => r.id))).toEqual([
      'b',
      'a',
    ]);
    expect(ids(sortRows(rows, { field: 'ghost', dir: 'asc' }, defs, (r) => r.id))).toEqual([
      'b',
      'a',
    ]);
  });

  it('строки: asc/desc по алфавиту', () => {
    const rows = [row('1', 'бета', 0), row('2', 'альфа', 0), row('3', 'гамма', 0)];
    expect(ids(sortRows(rows, { field: 'name', dir: 'asc' }, defs, (r) => r.id))).toEqual([
      '2',
      '1',
      '3',
    ]);
    expect(ids(sortRows(rows, { field: 'name', dir: 'desc' }, defs, (r) => r.id))).toEqual([
      '3',
      '1',
      '2',
    ]);
  });

  it('числа: по значению, не по строке (10 > 2)', () => {
    const rows = [row('1', null, 10), row('2', null, 2), row('3', null, 100)];
    expect(ids(sortRows(rows, { field: 'size', dir: 'asc' }, defs, (r) => r.id))).toEqual([
      '2',
      '1',
      '3',
    ]);
  });

  it('СТАБИЛЬНОСТЬ: равные значения — тай-брейк по rowKey по возрастанию при ОБОИХ направлениях', () => {
    const rows = [row('c', 'один', 0), row('a', 'один', 0), row('b', 'один', 0)];
    const asc = ids(sortRows(rows, { field: 'name', dir: 'asc' }, defs, (r) => r.id));
    const desc = ids(sortRows(rows, { field: 'name', dir: 'desc' }, defs, (r) => r.id));
    expect(asc).toEqual(['a', 'b', 'c']);
    // desc НЕ зеркало asc: тай-брейк всегда asc (порядок не «пляшет» между кликами).
    expect(desc).toEqual(['a', 'b', 'c']);
  });

  it('null — в конец и при asc, и при desc', () => {
    const rows = [
      row('n1', null, 0),
      row('1', 'альфа', 0),
      row('n2', null, 0),
      row('2', 'бета', 0),
    ];
    expect(ids(sortRows(rows, { field: 'name', dir: 'asc' }, defs, (r) => r.id))).toEqual([
      '1',
      '2',
      'n1',
      'n2',
    ]);
    expect(ids(sortRows(rows, { field: 'name', dir: 'desc' }, defs, (r) => r.id))).toEqual([
      '2',
      '1',
      'n1',
      'n2',
    ]);
  });

  it('null-хвост стабилен: null среди null — тай-брейк по rowKey', () => {
    const rows = [row('z', null, 0), row('a', null, 0)];
    expect(ids(sortRows(rows, { field: 'name', dir: 'asc' }, defs, (r) => r.id))).toEqual([
      'a',
      'z',
    ]);
  });

  it('исходный массив не мутируется', () => {
    const rows = [row('b', 'b', 2), row('a', 'a', 1)];
    sortRows(rows, { field: 'name', dir: 'asc' }, defs, (r) => r.id);
    expect(ids(rows)).toEqual(['b', 'a']);
  });
});
