import { describe, expect, it } from 'vitest';
import type { ChatMessage, FavoriteCard, UserRef } from '@nodus/contracts';

import { filterNotesFlow, mergeNotesFlow, splitNotesSelection } from './notes-flow.js';

const author: UserRef = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Иванов Иван',
  avatarUrl: null,
};

function message(id: string, createdAt: string, text = ''): ChatMessage {
  return {
    id,
    conversationId: '00000000-0000-4000-8000-0000000000c0',
    seq: 1,
    author,
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
    createdAt,
  };
}

function card(
  messageId: string,
  favoritedAt: string,
  extra: Partial<FavoriteCard> = {},
): FavoriteCard {
  return {
    messageId,
    conversationId: '00000000-0000-4000-8000-0000000000c1',
    conversationTitle: 'Проект «Школа»',
    conversationType: 'group',
    threadRootId: null,
    author,
    text: 'текст карточки',
    attachments: [],
    editedAt: null,
    deletedAt: null,
    obliterated: false,
    createdAt: favoritedAt,
    labels: [],
    favoritedAt,
    ...extra,
  };
}

describe('mergeNotesFlow', () => {
  it('сливает записи и карточки по времени ASC', () => {
    const entries = mergeNotesFlow(
      [message('m2', '2026-10-04T10:00:00Z'), message('m1', '2026-10-04T09:00:00Z')],
      [card('f1', '2026-10-04T09:30:00Z')],
    );
    expect(entries.map((e) => e.kind)).toEqual(['note', 'favorite', 'note']);
    expect(entries[0]).toHaveProperty('message.id', 'm1');
    expect(entries[1]).toHaveProperty('card.messageId', 'f1');
    expect(entries[2]).toHaveProperty('message.id', 'm2');
  });

  it('при равных метках запись первична (стабильный порядок)', () => {
    const at = '2026-10-04T10:00:00Z';
    const entries = mergeNotesFlow([message('m1', at)], [card('f1', at)]);
    expect(entries[0]?.kind).toBe('note');
    expect(entries[1]?.kind).toBe('favorite');
  });

  it('надгробия записей исключены из витрины', () => {
    const dead = { ...message('m0', '2026-10-04T08:00:00Z'), deletedAt: '2026-10-04T08:05:00Z' };
    const entries = mergeNotesFlow([dead, message('m1', '2026-10-04T09:00:00Z')], []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveProperty('message.id', 'm1');
  });
});

describe('filterNotesFlow', () => {
  const messages = [message('m1', '2026-10-04T09:00:00Z', 'позвонить в подряд')];
  const cards = [
    card('f1', '2026-10-04T09:30:00Z', { text: 'файл сметы' }),
    card('f2', '2026-10-04T10:00:00Z', { labels: ['🔑'] }),
  ];
  const all = mergeNotesFlow(messages, cards);

  it('all — весь поток', () => {
    expect(filterNotesFlow(all, 'all', null, [])).toHaveLength(3);
  });

  it('notes — только свои записи', () => {
    const notes = filterNotesFlow(all, 'notes', null, []);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.kind).toBe('note');
  });

  it('favorites — только карточки', () => {
    expect(filterNotesFlow(all, 'favorites', null, [])).toHaveLength(2);
  });

  it('метка — карточки с эмодзи (мультивыбор чипов)', () => {
    const withLabel = filterNotesFlow(all, 'all', null, ['🔑']);
    expect(withLabel).toHaveLength(1);
    expect(withLabel[0]).toHaveProperty('card.messageId', 'f2');
    expect(filterNotesFlow(all, 'all', null, ['🔑', '📌'])).toHaveLength(1);
  });

  it('поиск — по тексту записи и карточки', () => {
    expect(filterNotesFlow(all, 'all', 'подряд', [])).toHaveLength(1);
    expect(filterNotesFlow(all, 'all', 'смет', [])).toHaveLength(1);
    expect(filterNotesFlow(all, 'all', 'нет-такого', [])).toHaveLength(0);
  });
});

describe('splitNotesSelection (#215)', () => {
  const notesIds = new Set(['n1', 'n2']);

  it('записи — в noteIds, карточки — в cardIds, порядок сохраняется', () => {
    const { noteIds, cardIds } = splitNotesSelection(['c1', 'n1', 'c2', 'n2'], notesIds);
    expect(noteIds).toEqual(['n1', 'n2']);
    expect(cardIds).toEqual(['c1', 'c2']);
  });

  it('запись со звездой остаётся записью (удаляется целиком, не снимается)', () => {
    // Звёздная запись есть в ленте беседы «Избранного» → принадлежность
    // сообщениям беседы первична, дедуп витрины тут ни при чём.
    const { noteIds, cardIds } = splitNotesSelection(['n1'], notesIds);
    expect(noteIds).toEqual(['n1']);
    expect(cardIds).toEqual([]);
  });

  it('пустое выделение и пустой кэш ленты — устойчиво', () => {
    expect(splitNotesSelection([], notesIds)).toEqual({ noteIds: [], cardIds: [] });
    expect(splitNotesSelection(['x1', 'x2'], new Set())).toEqual({
      noteIds: [],
      cardIds: ['x1', 'x2'],
    });
  });

  it('с множеством карточек: неклассифицированное (кэш ленты протух) — запись', () => {
    // security-ревью #215: кэш messages(notesId) пуст/выгружен — id без
    // следа в кэше избранного консервативно идут записью: сервер
    // перепроверит автора/беседу, чужое молча пропустит (204-тишина
    // removeFavorite не съест удаление).
    const cards = new Set(['c1']);
    expect(splitNotesSelection(['c1', 'n1', 'ghost'], notesIds, cards)).toEqual({
      noteIds: ['n1', 'ghost'],
      cardIds: ['c1'],
    });
  });
});
