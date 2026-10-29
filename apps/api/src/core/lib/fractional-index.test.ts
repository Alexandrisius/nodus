import { describe, expect, it } from 'vitest';

import { keyBetween } from './fractional-index.js';

describe('keyBetween', () => {
  it('первый ключ пустой колонки — середина алфавита', () => {
    expect(keyBetween(null, null)).toBe('V');
  });

  it('ключ строго между соседями (байтовый порядок)', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
  });

  it('много вставок в начало и между — порядок держится, без хвостовых нулей', () => {
    const keys: string[] = [keyBetween(null, null)];
    for (let i = 0; i < 200; i++) keys.unshift(keyBetween(null, keys[0]!));
    for (let i = 0; i < 200; i++) keys.splice(1, 0, keyBetween(keys[0]!, keys[1]!));
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(keys.every((k) => !k.endsWith('0'))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('неверный порядок соседей — ошибка', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
  });
});
