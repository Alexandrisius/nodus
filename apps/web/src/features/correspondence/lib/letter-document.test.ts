import { describe, expect, it } from 'vitest';
import type { LetterListItem } from '@nodus/contracts';

import { documentStateOf, isLetterOverdue, isRegistrable, todayStr } from './letter-document.js';

/** Локальная дата со сдвигом в днях (yyyy-mm-dd) — дедлайны документа. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MAILBOX = {
  id: 'f0000000-0000-4000-8000-000000000001',
  address: 'info@passatproekt.by',
  kind: 'shared',
} as const;

const COUNTERPARTY = { id: 'd0000000-0000-4000-8000-000000000001', name: 'АО «Галургия»' };

function letter(overrides: Partial<LetterListItem> = {}): LetterListItem {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    type: 'incoming',
    receiveChannel: 'email',
    mailbox: { ...MAILBOX },
    counterparty: { ...COUNTERPARTY },
    subject: 'Тестовое письмо',
    recipients: [],
    cc: [],
    date: '2026-09-20T09:00:00.000Z',
    registration: null,
    documentStatus: null,
    inReplyToId: null,
    ...overrides,
  };
}

function registered(
  overrides: Partial<LetterListItem> = {},
  regOverrides: Partial<NonNullable<LetterListItem['registration']>> = {},
): LetterListItem {
  return letter({
    registration: {
      regNumber: 'Вх-2026/118',
      regDate: '2026-09-20',
      type: 'incoming',
      documentKind: { id: 'e0000000-0000-4000-8000-000000000001', name: 'Письмо' },
      counterparty: { ...COUNTERPARTY },
      project: null,
      addressee: null,
      deadline: null,
      correspondentNumber: null,
      correspondentDate: null,
      ...regOverrides,
    },
    documentStatus: 'in_work',
    ...overrides,
  });
}

describe('letter-document: статусы модели v2', () => {
  it('у письма (не документа) статуса нет', () => {
    expect(documentStateOf(letter())).toBeNull();
  });

  it('незарегистрированное входящее можно зарегистрировать, исходящее письмо — нет', () => {
    expect(isRegistrable(letter())).toBe(true);
    expect(isRegistrable(letter({ type: 'outgoing' }))).toBe(false);
    expect(isRegistrable(registered())).toBe(false);
  });

  it('документ в работе без срока и с будущим сроком — «в работе»', () => {
    expect(documentStateOf(registered())).toBe('in_work');
    expect(documentStateOf(registered({}, { deadline: dayOffset(3) }))).toBe('in_work');
  });

  it('просрочено — производное: в работе + срок раньше сегодня', () => {
    const overdue = registered({}, { deadline: dayOffset(-1) });
    expect(isLetterOverdue(overdue)).toBe(true);
    expect(documentStateOf(overdue)).toBe('overdue');
    // Срок сегодня — ещё не просрочено.
    expect(documentStateOf(registered({}, { deadline: dayOffset(0) }))).toBe('in_work');
  });

  it('исполнено и «в дело» — просрочка не перекрывает финальные статусы', () => {
    expect(
      documentStateOf(registered({ documentStatus: 'executed' }, { deadline: dayOffset(-5) })),
    ).toBe('executed');
    expect(
      documentStateOf(registered({ documentStatus: 'archived' }, { deadline: dayOffset(-5) })),
    ).toBe('archived');
  });

  it('todayStr — локальная дата yyyy-mm-dd', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
