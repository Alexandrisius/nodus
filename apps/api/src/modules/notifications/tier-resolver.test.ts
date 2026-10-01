import { describe, expect, it } from 'vitest';

import { resolveMessageNotifications, type MessageEventInput } from './tier-resolver.js';

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

/** M3: каждый ряд таблицы решений (ADR-0016 §3) — отдельный тест. */
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
    expect(one(list, ALICE)).toEqual({ userId: ALICE, tier: 'urgent', kind: 'urgent.message' });
  });

  it('ряд 3: direct — personal получателю (B1)', () => {
    const list = resolveMessageNotifications(input({ conversationType: 'direct' }));
    expect(one(list, ALICE)).toEqual({
      userId: ALICE,
      tier: 'personal',
      kind: 'chat.direct_message',
    });
  });

  it('ряд 3-muted: muted direct — фон без числа (B3)', () => {
    const list = resolveMessageNotifications(
      input({
        conversationType: 'direct',
        members: [
          { userId: ALICE, muted: true },
          { userId: AUTHOR, muted: false },
        ],
      }),
    );
    expect(one(list, ALICE).tier).toBe('background');
  });

  it('ряд 4: @упоминание — personal упомянутому, прочим фон (A1/A2)', () => {
    const list = resolveMessageNotifications(input({ mentionedUserIds: [ALICE] }));
    expect(one(list, ALICE)).toEqual({ userId: ALICE, tier: 'personal', kind: 'chat.mention' });
    expect(one(list, BOB)).toEqual({ userId: BOB, tier: 'background', kind: 'chat.channel_post' });
  });

  it('ряд 5: ответ в треде — personal участникам треда (B8, thread-follow)', () => {
    const list = resolveMessageNotifications(input({ threadWatcherIds: [BOB] }));
    expect(one(list, BOB)).toEqual({ userId: BOB, tier: 'personal', kind: 'chat.thread_reply' });
    expect(one(list, ALICE).kind).toBe('chat.channel_post');
  });

  it('ряд 6: корневое в группе без упоминаний — фон (B2)', () => {
    const list = resolveMessageNotifications(input());
    expect(one(list, ALICE).tier).toBe('background');
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
    expect(one(list, CAROL).tier).toBe('background');
  });

  it('A5: @самого себя в списке упомянутых — не персональное (автор уже skip)', () => {
    const list = resolveMessageNotifications(input({ mentionedUserIds: [AUTHOR, ALICE] }));
    expect(list.some((n) => n.userId === AUTHOR)).toBe(false);
    expect(one(list, ALICE).kind).toBe('chat.mention');
  });

  it('приоритет: urgent > mention (срочное с @ — одно urgent, не два)', () => {
    const list = resolveMessageNotifications(input({ urgent: true, mentionedUserIds: [ALICE] }));
    expect(list.filter((n) => n.userId === ALICE)).toHaveLength(1);
    expect(one(list, ALICE).kind).toBe('urgent.message');
  });

  it('приоритет: mention > thread > channel (упомянутый в треде — mention)', () => {
    const list = resolveMessageNotifications(
      input({ mentionedUserIds: [ALICE], threadWatcherIds: [ALICE, BOB] }),
    );
    expect(one(list, ALICE).kind).toBe('chat.mention');
    expect(one(list, BOB).kind).toBe('chat.thread_reply');
  });

  it('muted-упоминание — фон: журнал честен, ярус понижен', () => {
    const list = resolveMessageNotifications(
      input({
        mentionedUserIds: [ALICE],
        members: [
          { userId: AUTHOR, muted: false },
          { userId: ALICE, muted: true },
        ],
      }),
    );
    expect(one(list, ALICE).tier).toBe('background');
    expect(one(list, ALICE).kind).toBe('chat.mention');
  });
});
