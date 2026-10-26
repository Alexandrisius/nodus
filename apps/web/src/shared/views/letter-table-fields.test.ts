import { describe, expect, it } from 'vitest';

import { isResponseOverdue, theirReference } from './letter-table-fields.js';

describe('реквизиты корреспондента (#55)', () => {
  it('№ и дата — «№ от ДД.ММ.ГГГГ», по отдельности — что есть', () => {
    expect(theirReference({ theirNumber: '01-12/345', theirDate: '2026-10-20' })).toBe(
      '01-12/345 от 20.10.2026',
    );
    expect(theirReference({ theirNumber: '01-12/345', theirDate: null })).toBe('01-12/345');
    expect(theirReference({ theirNumber: null, theirDate: '2026-10-20' })).toBe('от 20.10.2026');
    expect(theirReference({ theirNumber: null, theirDate: null })).toBe('');
  });
});

describe('срок ответа истёк (#55)', () => {
  const letter = (responseDeadline: string | null, systemState: 'active' | 'closed') => ({
    responseDeadline,
    stage: { systemState },
  });

  it('вчерашний срок у письма в работе — истёк; сегодняшний — ещё нет', () => {
    expect(isResponseOverdue(letter('2026-10-25', 'active'), '2026-10-26')).toBe(true);
    expect(isResponseOverdue(letter('2026-10-26', 'active'), '2026-10-26')).toBe(false);
  });

  it('закрытое письмо и письмо без срока срок не «жгут»', () => {
    expect(isResponseOverdue(letter('2026-10-01', 'closed'), '2026-10-26')).toBe(false);
    expect(isResponseOverdue(letter(null, 'active'), '2026-10-26')).toBe(false);
  });
});
