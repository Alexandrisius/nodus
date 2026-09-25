import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';

const msg = (id: string, authorId: string, createdAt: string): ChatMessage => ({
  id,
  conversationId: 'conv-1',
  seq: Number(id.replace(/\D/g, '')) || 1,
  author: { id: authorId, displayName: `Имя ${authorId}`, avatarUrl: null },
  text: `текст ${id}`,
  replyToId: null,
  reply: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  threadRootId: null,
  threadRepliesCount: 0,
  reactions: [],
  attachments: [],
  editedAt: null,
  readAt: null,
  readBy: [],
  createdAt,
});

describe('buildMessageRuns — серии одного автора (план chat-messages-plan.md)', () => {
  it('чередование авторов — каждое сообщение своя серия, флаг mine по meId', () => {
    const runs = buildMessageRuns(
      [
        msg('1', 'a', '2026-09-14T09:00:00Z'),
        msg('2', 'b', '2026-09-14T09:01:00Z'),
        msg('3', 'a', '2026-09-14T09:02:00Z'),
      ],
      'a',
    );
    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.items.length)).toEqual([1, 1, 1]);
    expect(runs.map((r) => r.mine)).toEqual([true, false, true]);
  });

  it('подряд идущие сообщения одного автора — одна серия с порядком', () => {
    const runs = buildMessageRuns(
      [
        msg('1', 'a', '2026-09-14T09:00:00Z'),
        msg('2', 'a', '2026-09-14T09:01:00Z'),
        msg('3', 'b', '2026-09-14T09:02:00Z'),
        msg('4', 'b', '2026-09-14T09:03:00Z'),
        msg('5', 'b', '2026-09-14T09:04:00Z'),
        msg('6', 'a', '2026-09-14T09:05:00Z'),
      ],
      'a',
    );
    expect(runs.map((r) => r.items.length)).toEqual([2, 3, 1]);
    expect(runs[2]?.items[0]?.id).toBe('6');
  });

  it('пауза внутри дня серию НЕ рвёт (модель Телеграма: без порога минут)', () => {
    const runs = buildMessageRuns(
      [msg('1', 'a', '2026-09-14T08:00:00Z'), msg('2', 'a', '2026-09-14T17:30:00Z')],
      'a',
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.items).toHaveLength(2);
  });

  it('смена календарного дня рвёт серию того же автора', () => {
    const runs = buildMessageRuns(
      [msg('1', 'a', '2026-09-13T23:59:00Z'), msg('2', 'a', '2026-09-14T00:01:00Z')],
      'a',
    );
    expect(runs).toHaveLength(2);
  });

  it('пустая лента и одно сообщение', () => {
    expect(buildMessageRuns([], 'a')).toEqual([]);
    const runs = buildMessageRuns([msg('1', 'a', '2026-09-14T09:00:00Z')]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.mine).toBe(false);
  });
});

describe('startsNewDay — дата-чип', () => {
  it('перед первым сообщением ленты чип ставится всегда', () => {
    expect(startsNewDay(undefined, msg('1', 'a', '2026-09-14T09:00:00Z'))).toBe(true);
  });

  it('тот же день — без чипа, другой день — чип', () => {
    const prev = msg('1', 'a', '2026-09-14T09:00:00Z');
    expect(startsNewDay(prev, msg('2', 'a', '2026-09-14T18:00:00Z'))).toBe(false);
    expect(startsNewDay(prev, msg('3', 'a', '2026-09-15T06:00:00Z'))).toBe(true);
  });
});

describe('formatDayLabel — метка чипа (Intl ru-RU, now инжектирован)', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('сегодня и вчера — строки i18n', () => {
    expect(formatDayLabel('2026-09-14T08:00:00Z', now)).toBe('Сегодня');
    expect(formatDayLabel('2026-09-13T22:00:00Z', now)).toBe('Вчера');
  });

  it('старше — день и месяц по-русски', () => {
    expect(formatDayLabel('2026-09-05T10:00:00Z', now)).toBe('5 сентября');
  });
});

describe('buildMessageRuns — надгробия (A5, #87)', () => {
  const deleted = (id: string, authorId: string, at: string): ChatMessage => ({
    ...msg(id, authorId, at),
    deletedAt: at,
    text: '',
  });

  it('надгробие рвёт серию одного автора и живёт отдельной серией', () => {
    const runs = buildMessageRuns(
      [
        msg('1', 'a', '2026-09-14T09:00:00Z'),
        deleted('2', 'a', '2026-09-14T09:01:00Z'),
        msg('3', 'a', '2026-09-14T09:02:00Z'),
      ],
      'a',
    );
    expect(runs.map((r) => r.items.length)).toEqual([1, 1, 1]);
  });

  it('два надгробия подряд не сливаются (placeholder без автора/хвоста)', () => {
    const runs = buildMessageRuns(
      [deleted('1', 'a', '2026-09-14T09:00:00Z'), deleted('2', 'a', '2026-09-14T09:01:00Z')],
      'a',
    );
    expect(runs).toHaveLength(2);
  });
});
