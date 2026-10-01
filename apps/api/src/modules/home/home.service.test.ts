import { describe, expect, it } from 'vitest';

import { pickUpcomingBirthdays, type BirthdayUserRow } from './birthdays.js';

/** Чистая логика выбора дней рождения (#100): окно, «сегодня», сортировка,
 *  лимит, переход года и 29 февраля. */
const U = (id: string, iso: string, displayName = id): BirthdayUserRow => ({
  id,
  displayName,
  avatarUrl: null,
  birthDate: new Date(`${iso}T00:00:00.000Z`),
});

describe('pickUpcomingBirthdays', () => {
  const today = new Date('2026-10-01T00:00:00.000Z');

  it('берёт годовщины в окне, помечает «сегодня», сортирует по близости', () => {
    const got = pickUpcomingBirthdays(
      [
        U('a', '1990-10-10'), // через 9 дней
        U('b', '1985-10-01'), // сегодня
        U('c', '2000-10-03'), // через 2
        U('d', '1980-05-05'), // далеко в будущем окне прошлого года → следующий год, мимо
        U('e', '1995-10-16'), // за окном (15 дней) — мимо
      ],
      today,
    );
    expect(got.map((x) => x.user.id)).toEqual(['b', 'c', 'a']);
    expect(got[0]!.isToday).toBe(true);
    expect(got[0]!.birthDate).toBe('1985-10-01');
    expect(got[1]!.isToday).toBe(false);
  });

  it('уже прошедшая в этом году годовщина берётся следующим годом', () => {
    const got = pickUpcomingBirthdays(
      [U('x', '1999-09-30')],
      new Date('2026-10-01T00:00:00.000Z'),
      370,
    );
    // 30.09.2026 прошло → 30.09.2027, за пределами окна 370? 364 дня — внутри.
    expect(got).toHaveLength(1);
    expect(got[0]!.isToday).toBe(false);
  });

  it('29 февраля в невисокосный год не теряет человека (1 марта)', () => {
    const got = pickUpcomingBirthdays(
      [U('leap', '2000-02-29')],
      new Date('2027-02-20T00:00:00.000Z'),
      14,
    );
    expect(got).toHaveLength(1);
  });

  it('лимит обрезает список, пустой вход — пустой выход', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      U(`u${i}`, `1990-10-${String(i + 1).padStart(2, '0')}`),
    );
    expect(pickUpcomingBirthdays(many, today)).toHaveLength(8);
    expect(pickUpcomingBirthdays([], today)).toEqual([]);
  });
});
