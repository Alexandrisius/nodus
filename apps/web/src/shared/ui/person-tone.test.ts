import { describe, expect, it } from 'vitest';

import { personTone, personToneClasses } from './person-tone.js';

/** Персональный цвет имён (#180): детерминированность по id и покрытие
 *  палитры — чистая функция, границы детерминированы. */
describe('personTone (#180)', () => {
  it('детерминирован: один id — всегда один тон', () => {
    const id = 'f95dc76a-c5e1-4191-8b80-27b375ae1d8e';
    expect(personTone(id)).toBe(personTone(id));
    expect(personTone(id)).toBe(personTone(id));
  });

  it('всегда возвращает класс палитры', () => {
    for (const id of ['', 'a', 'night-a@nodus.local', crypto.randomUUID(), crypto.randomUUID()]) {
      expect(personToneClasses).toContain(personTone(id));
    }
  });

  it('покрывает палитру: на пуке случайных id встречаются все 7 тонов', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(personTone(crypto.randomUUID()));
    expect([...seen].sort()).toEqual([...personToneClasses].sort());
  });

  it('разные id дают разные тоны (в пределах палитры) — рядом стоящие различимы', () => {
    // Не гарантия для любой пары (палитра 7), но для набора рейла пилота
    // устойчиво: 10 случайных id занимают >3 тонов.
    const tones = new Set(Array.from({ length: 10 }, () => personTone(crypto.randomUUID())));
    expect(tones.size).toBeGreaterThan(3);
  });
});
