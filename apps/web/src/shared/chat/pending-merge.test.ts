import { describe, expect, it } from 'vitest';
import type { ChatMessage, Paginated } from '@nodus/contracts';

import { mergePendingIntoPage } from './pending-merge.js';

/**
 * Мердж летящих отправок в серверную страницу (#243): рефеч не съедает
 * темпы (seq=0) и локальные опережения (seq новее серверного снимка).
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

const page = (items: ChatMessage[]): Paginated<ChatMessage> => ({ items, nextCursor: null });

describe('mergePendingIntoPage', () => {
  it('темпы (seq=0) переносятся в хвост серверской страницы', () => {
    const prev = [m('a', 5), m('t1', 0, 't1'), m('t2', 0, 't2')];
    const server = page([m('a', 5)]);
    const merged = mergePendingIntoPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['a', 't1', 't2']);
  });

  it('темп, подтверждённый серверной страницей (clientMessageId), НЕ дублируется', () => {
    const prev = [m('a', 5), m('t1', 0, 't1')];
    const serverPage = page([m('a', 5), m('server-1', 6, 't1')]);
    const merged = mergePendingIntoPage(prev, serverPage);
    // Серверная версия вытесняет темп — ровно одна запись.
    expect(merged.items.map((x) => x.id)).toEqual(['a', 'server-1']);
  });

  it('подтверждённая запись, отсутствующая в ответе (удалена/за окном), НЕ возвращается призраком', () => {
    // e2e-регрессия: удаление ПОСЛЕДНЕГО сообщения — seq записи больше
    // максимума страницы, выглядела «опережением» и пережила рефеч у
    // получателя. Подтверждённые записи не переносятся: сервер не отдал —
    // значит её нет (гонка «ответ старее подтверждения» закрыта темпами:
    // WS/REST приходят после фиксации, свежий рефеч содержит запись).
    const prev = [m('a', 5), m('b', 6, 'b')];
    const server = page([m('a', 5)]);
    const merged = mergePendingIntoPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['a']);
  });

  it('старые записи, отсутствующие в странице (удалённые/obliterated), НЕ возвращаются', () => {
    const prev = [m('gone', 3, 'gone'), m('a', 5)];
    const server = page([m('a', 5)]);
    const merged = mergePendingIntoPage(prev, server);
    expect(merged.items.map((x) => x.id)).toEqual(['a']);
  });

  it('пустой prev → страница как есть (копия не нужна)', () => {
    const server = page([m('a', 5)]);
    expect(mergePendingIntoPage(undefined, server)).toBe(server);
    expect(mergePendingIntoPage([], server)).toBe(server);
  });

  it('nextCursor серверской страницы сохраняется', () => {
    const prev = [m('t1', 0, 't1')];
    const server: Paginated<ChatMessage> = { items: [m('a', 5)], nextCursor: 'cur' };
    const merged = mergePendingIntoPage(prev, server);
    expect(merged.nextCursor).toBe('cur');
  });
});
