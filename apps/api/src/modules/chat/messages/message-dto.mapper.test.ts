import { describe, expect, it } from 'vitest';

import type { MemberRow } from '../conversations/conversations.repository.js';
import type { MessageRow } from './messages.repository.js';
import { computeReadAt, computeReadBy } from './message-dto.mapper.js';

type ReadAtRow = Pick<MessageRow, 'authorId' | 'seq' | 'editedAt' | 'createdAt'>;

const T0 = new Date('2026-09-24T09:00:00Z');
const T1 = new Date('2026-09-24T10:00:00Z');
const T2 = new Date('2026-09-24T11:00:00Z');
const T3 = new Date('2026-09-24T12:00:00Z');

function row(overrides: Partial<ReadAtRow> = {}): ReadAtRow {
  return { authorId: 'me-1', seq: 5n, editedAt: null, createdAt: T0, ...overrides };
}

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    conversationId: 'conv-1',
    userId: 'peer-1',
    role: 'member',
    lastReadSeq: 0n,
    lastReadAt: null,
    pinned: false,
    muted: false,
    snoozed: false,
    hidden: false,
    ...overrides,
  };
}

describe('computeReadAt (первый прочитавший, #102)', () => {
  it('чужое сообщение → null', () => {
    expect(computeReadAt(row({ authorId: 'peer-1' }), [member()], 'me-1')).toBeNull();
  });

  it('«Заметки» (нет других участников) → createdAt', () => {
    expect(computeReadAt(row(), [], 'me-1')).toBe('2026-09-24T09:00:00.000Z');
    expect(computeReadAt(row(), [member({ userId: 'me-1' })], 'me-1')).toBe(
      '2026-09-24T09:00:00.000Z',
    );
  });

  it('direct: собеседник прочитал (курсор >= seq) → его lastReadAt', () => {
    const members = [member({ userId: 'me-1' }), member({ lastReadSeq: 5n, lastReadAt: T1 })];
    expect(computeReadAt(row(), members, 'me-1')).toBe('2026-09-24T10:00:00.000Z');
    expect(computeReadAt(row({ seq: 6n }), members, 'me-1')).toBeNull();
  });

  it('group: никто не прочитал → null; ПЕРВЫЙ прочитал → его lastReadAt (min)', () => {
    const me = member({ userId: 'me-1' });
    const read = (id: string, at: Date) => member({ userId: id, lastReadSeq: 9n, lastReadAt: at });
    // Никто: у второго курсор не дошёл.
    const nobody = [me, member({ userId: 'a', lastReadSeq: 4n, lastReadAt: T3 })];
    expect(computeReadAt(row(), nobody, 'me-1')).toBeNull();
    // Один из троих прочитал раньше остальных — его и берём (критерий #102:
    // «Климович открывает канал → у поста сразу галочка и Прочитано 1»).
    const some = [
      me,
      read('a', T1),
      read('b', T3),
      member({ userId: 'c', lastReadSeq: 4n, lastReadAt: T3 }),
    ];
    expect(computeReadAt(row(), some, 'me-1')).toBe('2026-09-24T10:00:00.000Z');
    // Все прочитали — по-прежнему первый (min, не max).
    const all = [me, read('a', T1), read('b', T3), read('c', T2)];
    expect(computeReadAt(row(), all, 'me-1')).toBe('2026-09-24T10:00:00.000Z');
  });

  it('правка: неперечитавшие исключаются, readAt — первый перечитавший', () => {
    const me = member({ userId: 'me-1' });
    const read = (id: string, at: Date) => member({ userId: id, lastReadSeq: 9n, lastReadAt: at });
    const edited = row({ editedAt: T2 });
    // a прочитал ДО правки — исключён; b перечитал после → его момент.
    expect(computeReadAt(edited, [me, read('a', T1), read('b', T3)], 'me-1')).toBe(
      '2026-09-24T12:00:00.000Z',
    );
    // Никто не перечитал → null.
    expect(computeReadAt(edited, [me, read('a', T1)], 'me-1')).toBeNull();
  });

  it('lastReadAt=null при lastReadSeq>0 не считается прочитавшим', () => {
    const members = [member({ userId: 'me-1' }), member({ lastReadSeq: 9n, lastReadAt: null })];
    expect(computeReadAt(row(), members, 'me-1')).toBeNull();
  });
});

describe('computeReadBy (#102)', () => {
  it('чужое сообщение → пустой список (прочитавших видит только автор)', () => {
    const members = [member({ userId: 'me-1' }), member({ lastReadSeq: 9n, lastReadAt: T1 })];
    expect(computeReadBy(row({ authorId: 'peer-1' }), members, 'peer-1')).toEqual([]);
  });

  it('своё: прочитавшие по возрастанию времени, исключая автора', () => {
    const me = member({ userId: 'me-1' });
    const read = (id: string, at: Date) => member({ userId: id, lastReadSeq: 9n, lastReadAt: at });
    const members = [
      me,
      read('b', T3),
      read('a', T1),
      member({ userId: 'c', lastReadSeq: 4n, lastReadAt: T3 }),
    ];
    expect(computeReadBy(row(), members, 'me-1')).toEqual([
      { userId: 'a', lastReadAt: T1 },
      { userId: 'b', lastReadAt: T3 },
    ]);
  });

  it('правка исключает прочитавшего до перечитывания', () => {
    const me = member({ userId: 'me-1' });
    const read = (id: string, at: Date) => member({ userId: id, lastReadSeq: 9n, lastReadAt: at });
    const edited = row({ editedAt: T2 });
    expect(computeReadBy(edited, [me, read('a', T1), read('b', T3)], 'me-1')).toEqual([
      { userId: 'b', lastReadAt: T3 },
    ]);
  });
});
