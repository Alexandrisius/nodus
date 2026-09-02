import { describe, expect, it } from 'vitest';

import { sha256Hex, stableStringify } from './stable-stringify.js';

describe('stableStringify', () => {
  it('порядок ключей не влияет на результат', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('массивы и null сериализуются детерминированно', () => {
    expect(stableStringify({ list: [1, null, 'x'] })).toBe('{"list":[1,null,"x"]}');
  });
});

describe('sha256Hex', () => {
  it('стабильный хэш одной строки', () => {
    expect(sha256Hex('key')).toBe(sha256Hex('key'));
    expect(sha256Hex('key')).not.toBe(sha256Hex('key2'));
  });
});
