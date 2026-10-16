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
    // Не гарантия для любой пары (палитра 7): фиксированный набор id
    // (случайные давали редкий флак — ≤3 тона из 10, #311).
    const ids = Array.from(
      { length: 10 },
      (_, i) => `6f1c2a3b-4d5e-4f60-8a7b-${String(i * 7919).padStart(12, '0')}`,
    );
    const tones = new Set(ids.map((id) => personTone(id)));
    expect(tones.size).toBeGreaterThan(3);
  });
});
