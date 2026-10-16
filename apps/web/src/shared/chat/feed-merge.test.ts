import { describe, expect, it } from 'vitest';
import type { ChatMessage, Paginated } from '@nodus/contracts';

import { mergeHistoryPage, type HistoryPage } from './feed-merge.js';

/**
 * Мердж серверной страницы в кэш ленты (#243 + #307): темпы выживают,
 * отсутствующие-в-окне не возвращаются призраками, догруженная история
 * (маркер oldestLoadedSeq) переживает рефеч с границей и маркером.
 */

const CONV = 'conv-1';

const m = (
  id: string,
  seq: number,
  clientMessageId: string = id,
  text = `текст ${id}`,
): ChatMessage => ({
  id,
  conversationId: CONV,
  seq,
  clientMessageId,
  author: { id: 'u1', displayName: 'Автор', avatarUrl: null },
  text,
  replyToId: null,
  reply: null,
  threadRootId: null,
  threadRepliesCount: 0,
  reactions: [],
  attachments: [],
  editedAt: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  readAt: null,
  readBy: [],
  urgent: false,
  mentionedUserIds: [],
  linkPreview: null,
  createdAt: '2026-10-07T10:00:00Z',
});

const page = (items: ChatMessage[], nextCursor: string | null = null): Paginated<ChatMessage> => ({
  items,
  nextCursor,
});

describe('mergeHistoryPage — канон #243 (без истории)', () => {
  it('темпы (seq=0) переносятся в хвост серверской страницы', () => {
    const prev: HistoryPage = page([m('a', 5), m('t1', 0, 't1'), m('t2', 0, 't2')]);
    const server = page([m('a', 5)]);
    const merged = mergeHistoryPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['a', 't1', 't2']);
  });

  it('темп, подтверждённый серверской страницей (clientMessageId), НЕ дублируется', () => {
    const prev: HistoryPage = page([m('a', 5), m('t1', 0, 't1')]);
    const server = page([m('a', 5), m('server-1', 6, 't1')]);
    const merged = mergeHistoryPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['a', 'server-1']);
  });

  it('подтверждённая запись, отсутствующая в ответе (удалена/за окном), НЕ возвращается призраком', () => {
    // e2e-регрессия #243: удаление хвоста. Маркера истории нет — «старое
    // отсутствующее» = удалено, канон прежний.
    const prev: HistoryPage = page([m('a', 5), m('b', 6, 'b')]);
    const server = page([m('a', 5)]);
    expect(mergeHistoryPage(prev, server).items.map((x) => x.id)).toEqual(['a']);
  });

  it('старые записи, отсутствующие в странице, НЕ возвращаются — и с окном новее', () => {
    const prev: HistoryPage = page([m('gone', 3, 'gone'), m('a', 5)]);
    const server = page([m('a', 5)]);
    expect(mergeHistoryPage(prev, server).items.map((x) => x.id)).toEqual(['a']);
  });

  it('пустой prev → страница как есть (копия не нужна)', () => {
    const server = page([m('a', 5)]);
    expect(mergeHistoryPage(undefined, server)).toBe(server);
    expect(mergeHistoryPage(page([]), server)).toBe(server);
  });

  it('nextCursor серверской страницы сохраняется', () => {
    const prev: HistoryPage = page([m('t1', 0, 't1')]);
    const server = page([m('a', 5)], 'cur');
    expect(mergeHistoryPage(prev, server).nextCursor).toBe('cur');
  });
});

describe('mergeHistoryPage — история #307 (маркер oldestLoadedSeq)', () => {
  it('догруженная история переживает рефеч: окно уехало вперёд, дыры нет', () => {
    // Загружено: окно 101..200 + история 51..100 (маркер 51). Пришло 10
    // новых: рефеч приносит окно 111..210. Ожидание: непрерывные 51..210 —
    // хвост старого окна (101..110) тоже становится историей и выживает,
    // иначе между историей и новым окном появилась бы дыра. Граница и
    // маркер — прежние (история в кэше по-прежнему до 51).
    const history = Array.from({ length: 50 }, (_, i) => m(`h${i}`, 51 + i));
    const window1 = Array.from({ length: 100 }, (_, i) => m(`w${i}`, 101 + i));
    const prev: HistoryPage = {
      items: [...history, ...window1],
      nextCursor: 'cursor-50',
      oldestLoadedSeq: 51,
    };
    const window2 = Array.from({ length: 100 }, (_, i) => m(`n${i}`, 111 + i));
    const server = page(window2, 'cursor-110');
    const merged = mergeHistoryPage(prev, server);
    expect(merged.items.map((x) => x.seq)).toEqual(Array.from({ length: 160 }, (_, i) => 51 + i));
    expect(merged.nextCursor).toBe('cursor-50');
    expect(merged.oldestLoadedSeq).toBe(51);
  });

  it('темпы живут в хвосте ПОВЕРХ истории после рефеча', () => {
    const prev: HistoryPage = {
      items: [m('h', 10), m('w', 20), m('t', 0, 't')],
      nextCursor: 'c',
      oldestLoadedSeq: 10,
    };
    const server = page([m('w', 20)], 'c2');
    const merged = mergeHistoryPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['h', 'w', 't']);
    expect(merged.nextCursor).toBe('c');
  });

  it('история между маркером и окном, но ВЫШЕ маркера отсутствующая — не resurrect', () => {
    // Записи старше маркера в кэше быть не должны; если оказались (анома-
    // лия кэша) — мердж их не сохраняет: истина только [marker, окно).
    const prev: HistoryPage = {
      items: [m('ancient', 1), m('h', 10), m('w', 20)],
      nextCursor: 'c',
      oldestLoadedSeq: 10,
    };
    const server = page([m('w', 20)], 'c2');
    const merged = mergeHistoryPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['h', 'w']);
  });
});
