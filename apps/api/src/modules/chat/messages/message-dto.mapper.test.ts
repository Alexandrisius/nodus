import { describe, expect, it } from 'vitest';

import type { MemberRow } from '../conversations/conversations.repository.js';
import type { MessageRow } from './messages.repository.js';
import { computeReadAt } from './message-dto.mapper.js';

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

describe('computeReadAt', () => {
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

  it('group: один из троих не прочитал → null; все прочитали → MAX lastReadAt', () => {
    const me = member({ userId: 'me-1' });
    const read = (id: string, at: Date) => member({ userId: id, lastReadSeq: 9n, lastReadAt: at });
    const all = [me, read('a', T1), read('b', T3), read('c', T2)];
    expect(computeReadAt(row(), all, 'me-1')).toBe('2026-09-24T12:00:00.000Z');
    const lagging = [
      me,
      read('a', T1),
      read('b', T3),
      member({ userId: 'c', lastReadSeq: 4n, lastReadAt: T3 }),
    ];
    expect(computeReadAt(row(), lagging, 'me-1')).toBeNull();
  });

  it('правка: кто-то не перечитал после editedAt → null; все перечитали → момент последнего', () => {
    const me = member({ userId: 'me-1' });
    const read = (id: string, at: Date) => member({ userId: id, lastReadSeq: 9n, lastReadAt: at });
    const edited = row({ editedAt: T2 });
    expect(computeReadAt(edited, [me, read('a', T1), read('b', T3)], 'me-1')).toBeNull();
    expect(computeReadAt(edited, [me, read('a', T2), read('b', T3)], 'me-1')).toBe(
      '2026-09-24T12:00:00.000Z',
    );
  });

  it('lastReadAt=null при lastReadSeq>0 не ломает расчёт (null)', () => {
    const members = [member({ userId: 'me-1' }), member({ lastReadSeq: 9n, lastReadAt: null })];
    expect(computeReadAt(row(), members, 'me-1')).toBeNull();
    expect(computeReadAt(row({ editedAt: T1 }), members, 'me-1')).toBeNull();
  });
});
