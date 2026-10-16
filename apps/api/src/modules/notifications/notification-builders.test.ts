import { describe, expect, it } from 'vitest';

import { buildInsertsFromMessageEvent } from './notification-builders.js';
import { PREVIEW_MAX } from './notifications.repository.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';
const MSG = '00000000-0000-4000-8000-0000000000d1';
const AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const ALICE = '00000000-0000-4000-8000-0000000000a2';
const EVENT_ID = '00000000-0000-4000-8000-0000000000e1';

const state = {
  type: 'group' as const,
  title: 'Проект',
  members: [
    { userId: AUTHOR, muted: false },
    { userId: ALICE, muted: false },
  ],
};

function event(overrides: { text?: string; urgent?: boolean } = {}) {
  return {
    id: EVENT_ID,
    payload: {
      conversationId: CONV,
      messageId: MSG,
      seq: 7,
      authorId: AUTHOR,
      threadRootId: null,
      urgent: overrides.urgent ?? false,
      mentionedUserIds: [],
      message: { text: overrides.text ?? 'Привет' },
    },
  };
}

describe('buildInsertsFromMessageEvent (чистый сборщик)', () => {
  it('строка на каждого адресата кроме автора, с источником и event_id', () => {
    const rows = buildInsertsFromMessageEvent(event(), state, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: ALICE,
      source_type: 'conversation',
      source_id: CONV,
      source_seq: 7n,
      actor_id: AUTHOR,
      preview: 'Привет',
      urgent_text: null,
      conversation_title: 'Проект',
      message_id: MSG,
      event_id: EVENT_ID,
    });
  });

  it('превью без токенов упоминаний и обрезано; важное несёт полный текст', () => {
    const long = `@[Анна](user:${ALICE}) ${'x'.repeat(PREVIEW_MAX + 50)}`;
    const [row] = buildInsertsFromMessageEvent(event({ text: long, urgent: true }), state, []);
    expect(row!.preview).not.toContain('user:');
    expect(row!.preview!.length).toBe(PREVIEW_MAX);
    expect(row!.priority).toBe('urgent');
    expect(row!.urgent_text!.length).toBeGreaterThan(PREVIEW_MAX);
  });

  it('пустой текст — превью null', () => {
    const [row] = buildInsertsFromMessageEvent(event({ text: '' }), state, []);
    expect(row!.preview).toBeNull();
  });
});
