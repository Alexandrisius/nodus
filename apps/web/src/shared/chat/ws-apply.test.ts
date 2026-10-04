import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ChatMessage, UserRef } from '@nodus/contracts';

import { chatKeys } from './api.js';
import { useAuthStore } from '../auth-store.js';
import { applyReadEvent, applyReactionEvent, applySentMessage } from './ws-apply.js';

/** Локальное применение chat.message_sent по seq (раунд 3, «буря рефечей»). */

const CONV = 'conv-1';
const ROOT = 'root-1';

const msg = (
  overrides: Partial<import('@nodus/contracts').ChatMessage> = {},
): import('@nodus/contracts').ChatMessage => ({
  id: 'm1',
  conversationId: CONV,
  seq: 1,
  author: { id: 'u1', displayName: 'Автор', avatarUrl: null },
  text: 'текст',
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
  requireAck: false,
  mentionedUserIds: [],
  createdAt: '2026-09-25T10:00:00Z',
  ...overrides,
});

function feed(client: QueryClient): ChatMessage[] {
  return client.getQueryData<{ items: ChatMessage[] }>(chatKeys.messages(CONV))?.items ?? [];
}

describe('applySentMessage', () => {
  it('непрерывный seq → дописывается в ленту БЕЗ рефеча (true)', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ id: 'a', seq: 5 })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: null,
      message: msg({ id: 'b', seq: 6 }),
    });
    expect(applied).toBe(true);
    expect(feed(client).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('дыра в seq → false (вызывающий инвалидирует)', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ id: 'a', seq: 5 })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: null,
      message: msg({ id: 'c', seq: 8 }),
    });
    expect(applied).toBe(false);
    expect(feed(client).map((m) => m.id)).toEqual(['a']);
  });

  it('сообщение уже в кэше (своя отправка мутацией) → true, без изменений', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ id: 'a', seq: 5 }), msg({ id: 'b', seq: 6 })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: null,
      message: msg({ id: 'b', seq: 6 }),
    });
    expect(applied).toBe(true);
    expect(feed(client)).toHaveLength(2);
  });

  it('нет кэша ленты → false (беседа не открыта)', () => {
    const client = new QueryClient();
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: null,
      message: msg({ seq: 1 }),
    });
    expect(applied).toBe(false);
  });

  it('темповая оптимистичная запись (seq=0) в хвосте → false (рефетч заменит)', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ id: 'a', seq: 5 }), msg({ id: 'temp', seq: 0 })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: null,
      message: msg({ id: 'b', seq: 6 }),
    });
    expect(applied).toBe(false);
  });

  it('ответ треда: лента + кэш треда + счётчик корня', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [
        msg({ id: ROOT, seq: 3, threadRepliesCount: 2 }),
        msg({ id: 'r2', seq: 5, threadRootId: ROOT }),
      ],
      nextCursor: null,
    });
    client.setQueryData(chatKeys.thread(CONV, ROOT), {
      items: [msg({ id: ROOT, seq: 3 }), msg({ id: 'r2', seq: 5, threadRootId: ROOT })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: ROOT,
      message: msg({ id: 'r3', seq: 6, threadRootId: ROOT }),
    });
    expect(applied).toBe(true);
    // Лента: ответ инлайн + счётчик корня вырос.
    const list = feed(client);
    expect(list.map((m) => m.id)).toEqual([ROOT, 'r2', 'r3']);
    expect(list[0]!.threadRepliesCount).toBe(3);
    // Кэш треда: ответ дописан.
    const thread = client.getQueryData<{ items: ChatMessage[] }>(chatKeys.thread(CONV, ROOT));
    expect(thread?.items.map((m) => m.id)).toEqual([ROOT, 'r2', 'r3']);
  });

  it('ответ треда без кэша треда: лента + счётчик корня (окно треда не открыто)', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ id: ROOT, seq: 3, threadRepliesCount: 0 })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: ROOT,
      message: msg({ id: 'r1', seq: 4, threadRootId: ROOT }),
    });
    expect(applied).toBe(true);
    const list = feed(client);
    expect(list.map((m) => m.id)).toEqual([ROOT, 'r1']);
    expect(list[0]!.threadRepliesCount).toBe(1);
  });

  it('лента применилась, но окно ОТКРЫТОГО треда с дырой → false (рефетч окна)', () => {
    // seq беседы общий: между ответами треда были чужие сообщения ленты —
    // в окне треда непрерывности нет, молчать нельзя (замечание валидатора).
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [
        msg({ id: ROOT, seq: 3 }),
        msg({ id: 'other-4', seq: 4 }),
        msg({ id: 'r2', seq: 5, threadRootId: ROOT }),
        msg({ id: 'other-6', seq: 6, threadRootId: 'other-root' }),
      ],
      nextCursor: null,
    });
    client.setQueryData(chatKeys.thread(CONV, ROOT), {
      items: [msg({ id: ROOT, seq: 3 }), msg({ id: 'r2', seq: 5, threadRootId: ROOT })],
      nextCursor: null,
    });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: ROOT,
      message: msg({ id: 'r3', seq: 7, threadRootId: ROOT }),
    });
    // Лента дописана (последующий рефеч безвреден), но окно треда само не
    // догонит — применением считать нельзя.
    expect(applied).toBe(false);
    expect(feed(client).map((m) => m.id)).toContain('r3');
    const thread = client.getQueryData<{ items: ChatMessage[] }>(chatKeys.thread(CONV, ROOT));
    expect(thread?.items.map((m) => m.id)).toEqual([ROOT, 'r2']); // ждёт рефеч
  });

  it('нет DTO в событии (старый издатель) → false', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), { items: [], nextCursor: null });
    const applied = applySentMessage(client, {
      conversationId: CONV,
      threadRootId: null,
      message: undefined,
    });
    expect(applied).toBe(false);
  });
});

describe('applyReactionEvent (#124)', () => {
  const READER = { id: 'u2', displayName: 'Читатель', avatarUrl: null };

  function seedConvWithReader(client: QueryClient) {
    client.setQueryData(chatKeys.conversations(), {
      items: [
        {
          id: CONV,
          type: 'group',
          title: 'б',
          avatarUrl: null,
          myRole: 'member',
          permissions: {
            changeInfo: 'owner',
            addMembers: 'owner',
            removeMembers: 'owner',
            post: 'member',
            manageSettings: 'owner',
          },
          draft: null,
          visibility: null,
          description: null,
          project: null,
          task: null,
          letter: null,
          membersPreview: [READER],
          lastMessage: null,
          unreadCount: 0,
          myLastReadSeq: 0,
          pinned: false,
          muted: false,
          snoozed: false,
        },
      ],
      nextCursor: null,
    });
  }

  it('added: чип патчится в ленте без рефеча (актор не я, users из кэша)', () => {
    const client = new QueryClient();
    seedConvWithReader(client);
    client.setQueryData(chatKeys.messages(CONV), { items: [msg()], nextCursor: null });
    const applied = applyReactionEvent(
      client,
      { conversationId: CONV, messageId: 'm1', emoji: '👍', userId: 'u2' },
      true,
    );
    expect(applied).toBe(true);
    expect(feed(client)[0]?.reactions).toEqual([
      { emoji: '👍', count: 1, mine: false, users: [READER] },
    ]);
  });

  it('added-эхо актёра уже в users (беседа с собой) — дубль не растит count', () => {
    const client = new QueryClient();
    seedConvWithReader(client);
    // В беседе с собой membersPreview = сам зритель (канон #186): WS-эхо
    // собственной реакции приносит reader == уже записанный актёр.
    const SELF = { id: 'u2', displayName: 'Читатель', avatarUrl: null };
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ reactions: [{ emoji: '👍', count: 1, mine: true, users: [SELF] }] })],
      nextCursor: null,
    });
    const applied = applyReactionEvent(
      client,
      { conversationId: CONV, messageId: 'm1', emoji: '👍', userId: 'u2' },
      true,
    );
    expect(applied).toBe(true);
    expect(feed(client)[0]?.reactions).toEqual([
      { emoji: '👍', count: 1, mine: true, users: [SELF] },
    ]);
  });

  it('removed: декремент; ноль убирает чип', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), {
      items: [msg({ reactions: [{ emoji: '👍', count: 1, mine: false, users: [READER] }] })],
      nextCursor: null,
    });
    const applied = applyReactionEvent(
      client,
      { conversationId: CONV, messageId: 'm1', emoji: '👍', userId: 'u2' },
      false,
    );
    expect(applied).toBe(true);
    expect(feed(client)[0]?.reactions).toEqual([]);
  });

  it('сообщения нет в кэше — false (вызывающий инвалидирует)', () => {
    const client = new QueryClient();
    const applied = applyReactionEvent(
      client,
      { conversationId: CONV, messageId: 'm1', emoji: '👍', userId: 'u2' },
      true,
    );
    expect(applied).toBe(false);
  });
});

describe('applyReadEvent (#124)', () => {
  const ME = '00000000-0000-4000-8000-000000000001';
  const READER = '00000000-0000-4000-8000-000000000002';

  function seedConversations(client: QueryClient, members: UserRef[]) {
    client.setQueryData(chatKeys.conversations(), {
      items: [
        {
          id: CONV,
          type: 'group',
          title: 'беседа',
          avatarUrl: null,
          myRole: 'member',
          permissions: {
            changeInfo: 'owner',
            addMembers: 'owner',
            removeMembers: 'owner',
            post: 'member',
            manageSettings: 'owner',
          },
          draft: null,
          visibility: null,
          description: null,
          project: null,
          task: null,
          letter: null,
          membersPreview: members,
          lastMessage: null,
          unreadCount: 0,
          myLastReadSeq: 0,
          pinned: false,
          muted: false,
          snoozed: false,
        },
      ],
      nextCursor: null,
    });
  }

  beforeEach(() => {
    useAuthStore.setState({
      user: { id: ME, displayName: 'Я', email: 'me@nodus.by', permissions: [] },
    });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('чужое прочтение: readBy/readAt моих сообщений до upToSeq', () => {
    const client = new QueryClient();
    seedConversations(client, [{ id: READER, displayName: 'Читатель', avatarUrl: null }]);
    client.setQueryData(chatKeys.messages(CONV), {
      items: [
        msg({ id: 'mine', author: { id: ME, displayName: 'Я', avatarUrl: null }, seq: 3 }),
        msg({ id: 'theirs', author: { id: READER, displayName: 'Ч', avatarUrl: null }, seq: 4 }),
      ],
      nextCursor: null,
    });
    const applied = applyReadEvent(client, {
      conversationId: CONV,
      userId: READER,
      upToSeq: 3,
      readAt: '2026-09-27T10:00:00Z',
    });
    expect(applied).toBe(true);
    const [mine, theirs] = feed(client);
    expect(mine?.readBy.map((r) => r.id)).toEqual([READER]);
    expect(mine?.readAt).toBe('2026-09-27T10:00:00Z');
    expect(theirs?.readBy).toEqual([]);
  });

  it('своё прочтение — true без патча (readBy себя не включает)', () => {
    const client = new QueryClient();
    client.setQueryData(chatKeys.messages(CONV), { items: [msg()], nextCursor: null });
    const applied = applyReadEvent(client, {
      conversationId: CONV,
      userId: ME,
      upToSeq: 9,
      readAt: '2026-09-27T10:00:00Z',
    });
    expect(applied).toBe(true);
    expect(feed(client)[0]?.readBy).toEqual([]);
  });

  it('читателя нет в membersPreview — false (вызывающий инвалидирует)', () => {
    const client = new QueryClient();
    seedConversations(client, []);
    client.setQueryData(chatKeys.messages(CONV), { items: [msg()], nextCursor: null });
    const applied = applyReadEvent(client, {
      conversationId: CONV,
      userId: READER,
      upToSeq: 9,
      readAt: '2026-09-27T10:00:00Z',
    });
    expect(applied).toBe(false);
  });
});
