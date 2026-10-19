import { describe, expect, it } from 'vitest';

import { maxSeenSeq } from './use-viewport-read.js';

/** Честная видимость (раунд 3): строка просмотрена ⇔ её НИЖНИЙ КРАЙ виден —
 *  «верхушка пузыря» не считается просмотром (замечание владельца 4). */

describe('maxSeenSeq (геометрия просмотренности)', () => {
  const fold = 600; // низ вьюпорта

  it('полностью видимые строки — по max seq', () => {
    const max = maxSeenSeq(
      [
        { seq: 3, bottom: 300 },
        { seq: 4, bottom: 500 },
      ],
      fold,
    );
    expect(max).toBe(4);
  });

  it('верхушка без низа ≠ просмотрено: seq 6 ниже сгиба', () => {
    const max = maxSeenSeq(
      [
        { seq: 5, bottom: 580 },
        { seq: 6, bottom: 640 }, // виден только верх
      ],
      fold,
    );
    expect(max).toBe(5);
  });

  it('допуск ±4px: низ на границе сгиба считается видимым', () => {
    expect(maxSeenSeq([{ seq: 7, bottom: 603 }], fold)).toBe(7);
    expect(maxSeenSeq([{ seq: 7, bottom: 605 }], fold)).toBe(null);
  });

  it('ничего не видно → null', () => {
    expect(maxSeenSeq([], fold)).toBe(null);
    expect(maxSeenSeq([{ seq: 1, bottom: 900 }], fold)).toBe(null);
  });
});
