import { notificationKindSchema } from '@nodus/contracts';
import { describe, expect, it } from 'vitest';

import {
  KIND_PRIORITY,
  resolveMessageNotifications,
  type MessageEventInput,
} from './priority-resolver.js';

const AUTHOR = '11111111-1111-1111-1111-111111111111';
const ALICE = '22222222-2222-2222-2222-222222222222';
const BOB = '33333333-3333-3333-3333-333333333333';
const CAROL = '44444444-4444-4444-4444-444444444444';

function input(overrides: Partial<MessageEventInput> = {}): MessageEventInput {
  return {
    conversationType: 'group',
    authorId: AUTHOR,
    urgent: false,
    mentionedUserIds: [],
    threadWatcherIds: [],
    members: [
      { userId: AUTHOR, muted: false },
      { userId: ALICE, muted: false },
      { userId: BOB, muted: false },
    ],
    ...overrides,
  };
}

function one(list: ReturnType<typeof resolveMessageNotifications>, userId: string) {
  const hit = list.find((n) => n.userId === userId);
  if (!hit) throw new Error(`no notification for ${userId}`);
  return hit;
}

/** Полнота таблицы: каждый kind контракта имеет строку приоритета (тип +
 *  рантайм-сверка — новый kind без строки не пройдёт компиляцию и этот тест). */
describe('KIND_PRIORITY', () => {
  it('покрывает все kind контракта без пропусков', () => {
    const kinds = notificationKindSchema.options;
    expect(Object.keys(KIND_PRIORITY).sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      expect(['urgent', 'high', 'medium', 'low']).toContain(KIND_PRIORITY[kind]);
    }
  });

  it('стартовые значения #189 сохраняют поведение прежних ярусов 1:1', () => {
    expect(KIND_PRIORITY['urgent.message']).toBe('urgent');
    expect(KIND_PRIORITY['chat.direct_message']).toBe('high');
    expect(KIND_PRIORITY['chat.mention']).toBe('high');
    expect(KIND_PRIORITY['chat.thread_reply']).toBe('high');
    expect(KIND_PRIORITY['chat.channel_post']).toBe('low');
    expect(KIND_PRIORITY['chat.message_edited']).toBe('low');
    expect(KIND_PRIORITY['action.assignment']).toBe('medium');
  });
});

/** Каждый ряд таблицы решений (ADR-0016 §3 → ADR-0017) — отдельный тест. */
describe('resolveMessageNotifications', () => {
  it('ряд 1: автора нет в адресатах — себя не уведомляем (B9)', () => {
    const list = resolveMessageNotifications(input());
    expect(list.some((n) => n.userId === AUTHOR)).toBe(false);
  });

  it('ряд 2: срочное — всем получателям urgent, mute не понижает', () => {
    const list = resolveMessageNotifications(
      input({
        urgent: true,
        members: [
          { userId: ALICE, muted: true },
          { userId: AUTHOR, muted: false },
        ],
      }),
    );
    expect(one(list, ALICE)).toEqual({ userId: ALICE, priority: 'urgent', kind: 'urgent.message' });
  });

  it('ряд 3: direct — high получателю (B1)', () => {
    const list = resolveMessageNotifications(input({ conversationType: 'direct' }));
    expect(one(list, ALICE)).toEqual({
      userId: ALICE,
      priority: 'high',
      kind: 'chat.direct_message',
    });
  });

  it('ряд 3-muted: muted direct — low без числа (B3)', () => {
    const list = resolveMessageNotifications(
      input({
        conversationType: 'direct',
        members: [
          { userId: ALICE, muted: true },
          { userId: AUTHOR, muted: false },
        ],
      }),
    );
    expect(one(list, ALICE).priority).toBe('low');
  });

  it('ряд 4: @упоминание — high упомянутому, прочим low (A1/A2)', () => {
    const list = resolveMessageNotifications(input({ mentionedUserIds: [ALICE] }));
    expect(one(list, ALICE)).toEqual({ userId: ALICE, priority: 'high', kind: 'chat.mention' });
    expect(one(list, BOB)).toEqual({ userId: BOB, priority: 'low', kind: 'chat.channel_post' });
  });

  it('ряд 5: ответ в треде — high участникам треда (B8, thread-follow)', () => {
    const list = resolveMessageNotifications(input({ threadWatcherIds: [BOB] }));
    expect(one(list, BOB)).toEqual({ userId: BOB, priority: 'high', kind: 'chat.thread_reply' });
    expect(one(list, ALICE).kind).toBe('chat.channel_post');
  });

  it('ряд 6: корневое в группе без упоминаний — low (B2)', () => {
    const list = resolveMessageNotifications(input());
    expect(one(list, ALICE).priority).toBe('low');
    expect(one(list, ALICE).kind).toBe('chat.channel_post');
  });

  it('A3: два разных @ — каждому своё; дублей по userId нет', () => {
    const list = resolveMessageNotifications(
      input({
        mentionedUserIds: [ALICE, BOB],
        members: input().members.concat({ userId: CAROL, muted: false }),
      }),
    );
    expect(one(list, ALICE).kind).toBe('chat.mention');
    expect(one(list, BOB).kind).toBe('chat.mention');
    expect(list.filter((n) => n.userId === ALICE)).toHaveLength(1);
    expect(one(list, CAROL).priority).toBe('low');
  });

  it('A5: @самого себя в списке упомянутых — не персональное (автор уже skip)', () => {
    const list = resolveMessageNotifications(input({ mentionedUserIds: [AUTHOR, ALICE] }));
    expect(list.some((n) => n.userId === AUTHOR)).toBe(false);
    expect(one(list, ALICE).kind).toBe('chat.mention');
  });

  it('приоритет kind: urgent > mention (срочное с @ — одно urgent, не два)', () => {
    const list = resolveMessageNotifications(input({ urgent: true, mentionedUserIds: [ALICE] }));
    expect(list.filter((n) => n.userId === ALICE)).toHaveLength(1);
    expect(one(list, ALICE).kind).toBe('urgent.message');
  });

  it('приоритет kind: mention > thread > channel (упомянутый в треде — mention)', () => {
    const list = resolveMessageNotifications(
      input({ mentionedUserIds: [ALICE], threadWatcherIds: [ALICE, BOB] }),
    );
    expect(one(list, ALICE).kind).toBe('chat.mention');
    expect(one(list, BOB).kind).toBe('chat.thread_reply');
  });

  it('muted-упоминание — low: журнал честен, приоритет понижен', () => {
    const list = resolveMessageNotifications(
      input({
        mentionedUserIds: [ALICE],
        members: [
          { userId: AUTHOR, muted: false },
          { userId: ALICE, muted: true },
        ],
      }),
    );
    expect(one(list, ALICE).priority).toBe('low');
    expect(one(list, ALICE).kind).toBe('chat.mention');
  });

  it('КРИТЕРИЙ #189: приоритет адресата следует таблице — правка строки меняет результат', () => {
    // «Поднять пост в канал с low на high одной строкой» — то же преобразование,
    // что делает правка строки KIND_PRIORITY['chat.channel_post'] = 'high'.
    const original = KIND_PRIORITY['chat.channel_post'];
    try {
      KIND_PRIORITY['chat.channel_post'] = 'high';
      const list = resolveMessageNotifications(input());
      expect(one(list, ALICE).priority).toBe('high');
    } finally {
      KIND_PRIORITY['chat.channel_post'] = original;
    }
    const list = resolveMessageNotifications(input());
    expect(one(list, ALICE).priority).toBe('low');
  });
});
