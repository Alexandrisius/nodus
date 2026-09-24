import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  conversationDraftSchema,
  conversationListItemSchema,
  ErrorCode,
  messageSchema,
  paginatedSchema,
  type ConversationListItem,
} from '@nodus/contracts';

import { PrismaService } from '../../src/core/database/prisma.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Контракт бесед на живом HTTP (критерий приёмки #58): создание группы с
 * ролями и дефолтами прав, список (unread/lastMessage/membersPreview),
 * персональные pinned/hidden, черновики с серверным revision, find-or-create
 * direct (симметрия пары и «Заметки»), поиск по названию и по имени участника.
 */

// Дефолты матрицы прав (контракт conversationPermissionsSchema).
const DEFAULT_PERMISSIONS = {
  changeInfo: 'admin',
  addMembers: 'member',
  removeMembers: 'admin',
  post: 'member',
  manageSettings: 'owner',
};

describe.skipIf(!process.env.DATABASE_URL)('chat: беседы (integration)', () => {
  let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
  let prisma: PrismaService;
  let alice: ChatUser;
  let bob: ChatUser;
  let carol: ChatUser;
  let group: ConversationListItem;

  beforeAll(async () => {
    fx = await setupChatFixture(['alice', 'bob', 'carol']);
    prisma = fx.prisma;
    ({ alice, bob, carol } = fx.users);
  }, 120_000);

  afterAll(async () => {
    await fx?.cleanup();
  });

  /** Беседа пользователя в его списке (падение — если беседы нет). */
  async function getItem(user: ChatUser, conversationId: string): Promise<ConversationListItem> {
    const page = await fx.listConversations(user);
    const item = page.items.find((i) => i.id === conversationId);
    expect(item, `беседа ${conversationId} должна быть в списке`).toBeDefined();
    return item!;
  }

  it('создание группы: owner+member строки, дефолты прав, превью без зрителя', async () => {
    const res = await fx.api(alice, 'POST', '/chat/conversations', {
      body: { type: 'group', title: `Рабочая группа ${fx.runId}`, memberIds: [bob.id, carol.id] },
    });
    expect(res.status).toBe(201);
    group = conversationListItemSchema.parse(await res.json());
    expect(group.type).toBe('group');
    expect(group.myRole).toBe('owner');
    expect(group.permissions).toEqual(DEFAULT_PERMISSIONS);
    expect(group.membersPreview.map((u) => u.id).sort()).toEqual([bob.id, carol.id].sort());
    expect(group.unreadCount).toBe(0);
    expect(group.lastMessage).toBeNull();
    expect(group.draft).toBeNull();
    expect(group.visibility).toBe('closed');

    // Строки участников: создатель owner, приглашённые member.
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: group.id },
    });
    const roleByUser = new Map(members.map((m) => [m.userId, m.role]));
    expect(roleByUser.get(alice.id)).toBe('owner');
    expect(roleByUser.get(bob.id)).toBe('member');
    expect(roleByUser.get(carol.id)).toBe('member');
  });

  it('GET списка для каждого участника: своя роль, превью — остальные', async () => {
    for (const [user, expectedPreview] of [
      [bob, [alice.id, carol.id]],
      [carol, [alice.id, bob.id]],
    ] as const) {
      const item = await getItem(user, group.id);
      expect(item.myRole).toBe('member');
      expect(item.permissions).toEqual(DEFAULT_PERMISSIONS);
      expect(item.membersPreview.map((u) => u.id).sort()).toEqual([...expectedPreview].sort());
      expect(item.unreadCount).toBe(0);
      expect(item.lastMessage).toBeNull();
      expect(item.pinned).toBe(false);
    }
  });

  it('сообщение → unreadCount=1 и lastMessage у получателей; чтение гасит watermark', async () => {
    const send = await fx.api(alice, 'POST', `/chat/conversations/${group.id}/messages`, {
      body: { text: 'Привет, группа' },
    });
    expect(send.status).toBe(201);
    const message = messageSchema.parse(await send.json());

    const forBob = await getItem(bob, group.id);
    expect(forBob.unreadCount).toBe(1);
    expect(forBob.lastMessage?.id).toBe(message.id);
    expect(forBob.lastMessage?.text).toBe('Привет, группа');
    expect(forBob.lastMessage?.author.id).toBe(alice.id);
    expect((await getItem(carol, group.id)).unreadCount).toBe(1);
    expect((await getItem(alice, group.id)).unreadCount).toBe(0); // автор не считает себя

    // Получатель открыл ленту → курсор прочтения догнал → unread 0.
    const feed = await fx.api(bob, 'GET', `/chat/conversations/${group.id}/messages`);
    const page = paginatedSchema(messageSchema).parse(await feed.json());
    expect(page.items.map((m) => m.id)).toContain(message.id);
    expect((await getItem(bob, group.id)).unreadCount).toBe(0);
    expect((await getItem(carol, group.id)).unreadCount).toBe(1); // не читал — не погасло
  });

  it('PATCH pinned=true действует только для этого пользователя', async () => {
    const patched = await fx.api(alice, 'PATCH', `/chat/conversations/${group.id}`, {
      body: { pinned: true },
    });
    expect(patched.status).toBe(200);
    expect(conversationListItemSchema.parse(await patched.json()).pinned).toBe(true);
    expect((await getItem(bob, group.id)).pinned).toBe(false);
  });

  it('PATCH hidden убирает беседу из списка и возвращает обратно', async () => {
    const hidden = await fx.api(bob, 'PATCH', `/chat/conversations/${group.id}`, {
      body: { hidden: true },
    });
    expect(hidden.status).toBe(200);
    expect((await fx.listConversations(bob)).items.map((i) => i.id)).not.toContain(group.id);
    expect((await fx.listConversations(alice)).items.map((i) => i.id)).toContain(group.id); // чужой hidden не тронут

    const restored = await fx.api(bob, 'PATCH', `/chat/conversations/${group.id}`, {
      body: { hidden: false },
    });
    expect(restored.status).toBe(200);
    expect((await fx.listConversations(bob)).items.map((i) => i.id)).toContain(group.id);
  });

  it('черновик: revision монотонен, пустой текст удаляет, отправка гасит', async () => {
    const put = (text: string) =>
      fx.api(alice, 'PUT', `/chat/conversations/${group.id}/draft`, { body: { text } });

    const first = await put('черновик один');
    expect(first.status).toBe(200);
    expect(conversationDraftSchema.parse(await first.json())).toMatchObject({
      text: 'черновик один',
      revision: 1,
    });
    const second = await put('черновик два');
    expect(conversationDraftSchema.parse(await second.json())).toMatchObject({
      text: 'черновик два',
      revision: 2,
    });
    // Черновик персонален: у bob его нет.
    expect((await getItem(bob, group.id)).draft).toBeNull();
    expect((await getItem(alice, group.id)).draft).toMatchObject({
      text: 'черновик два',
      revision: 2,
    });

    // Пустой текст = удаление: ответ null и в списке его больше нет.
    const cleared = await put('');
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toBeNull();
    expect((await getItem(alice, group.id)).draft).toBeNull();

    // После удаления счёт начинается заново; отправка сообщения гасит черновик.
    const fresh = await put('перед отправкой');
    expect(conversationDraftSchema.parse(await fresh.json()).revision).toBe(1);
    const sent = await fx.api(alice, 'POST', `/chat/conversations/${group.id}/messages`, {
      body: { text: 'готово' },
    });
    expect(sent.status).toBe(201);
    expect((await getItem(alice, group.id)).draft).toBeNull();
  });

  it('find-or-create direct: повтор идемпотентен, (a,b)==(b,a), «с собой» отдельная', async () => {
    const first = await fx.api(alice, 'GET', `/chat/conversations/direct/${bob.id}`);
    expect(first.status).toBe(201);
    const direct = conversationListItemSchema.parse(await first.json());
    expect(direct.type).toBe('direct');

    const repeat = await fx.api(alice, 'GET', `/chat/conversations/direct/${bob.id}`);
    expect(repeat.status).toBe(200); // существующая — не 201
    expect(conversationListItemSchema.parse(await repeat.json()).id).toBe(direct.id);

    // Пара симметрична: вызов от второго участника даёт ту же беседу.
    const fromBob = await fx.api(bob, 'GET', `/chat/conversations/direct/${alice.id}`);
    expect(fromBob.status).toBe(200);
    const forBob = conversationListItemSchema.parse(await fromBob.json());
    expect(forBob.id).toBe(direct.id);
    expect(forBob.myRole).toBe('member');
    expect(forBob.membersPreview.map((u) => u.id)).toEqual([alice.id]);

    // Ровно одна direct-беседа пары в БД, у обеих сторон membership.
    const pair = [alice.id, bob.id].sort();
    expect(
      await prisma.conversation.count({
        where: { type: 'direct', userMin: pair[0], userMax: pair[1] },
      }),
    ).toBe(1);
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: direct.id },
    });
    expect(new Set(members.map((m) => m.userId))).toEqual(new Set([alice.id, bob.id]));

    // «Заметки»: отдельная беседа, user_min == user_max, превью — сам зритель.
    const self = await fx.api(alice, 'GET', `/chat/conversations/direct/${alice.id}`);
    expect(self.status).toBe(201);
    const notes = conversationListItemSchema.parse(await self.json());
    expect(notes.id).not.toBe(direct.id);
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: notes.id } });
    expect(row.userMin).toBe(alice.id);
    expect(row.userMax).toBe(alice.id);
    expect(notes.membersPreview.map((u) => u.id)).toEqual([alice.id]);
  });

  it('поиск: по названию беседы и по имени участника', async () => {
    const notes = await fx.api(alice, 'GET', `/chat/conversations/direct/${alice.id}`);
    const notesItem = conversationListItemSchema.parse(await notes.json());

    // По подстроке названия находят оба участника.
    for (const user of [alice, bob]) {
      const found = await fx.api(user, 'GET', `/chat/conversations?search=Рабочая группа`);
      expect(found.status).toBe(200);
      const items = paginatedSchema(conversationListItemSchema).parse(await found.json()).items;
      expect(items.map((i) => i.id)).toContain(group.id);
    }

    // По имени участника (Вера) — только беседы, где она состоит.
    const byMember = paginatedSchema(conversationListItemSchema).parse(
      await (
        await fx.api(
          alice,
          'GET',
          `/chat/conversations?search=${encodeURIComponent(`Чатов${fx.runId} Вера`)}`,
        )
      ).json(),
    ).items;
    expect(byMember.map((i) => i.id)).toContain(group.id);
    expect(byMember.map((i) => i.id)).not.toContain(notesItem.id); // «Заметки» — только alice

    // Негативный поиск — пусто.
    const none = await fx.api(
      alice,
      'GET',
      `/chat/conversations?search=${encodeURIComponent('таких нет')}`,
    );
    expect(paginatedSchema(conversationListItemSchema).parse(await none.json()).items).toHaveLength(
      0,
    );
  });

  it('чужая беседа неотличима от несуществующей (404, не палит наличие)', async () => {
    // carol не состоит в direct alice↔bob — но в group состоит; создаём пару без неё.
    const outsider = carol;
    const directRes = await fx.api(alice, 'GET', `/chat/conversations/direct/${bob.id}`);
    const direct = conversationListItemSchema.parse(await directRes.json());
    const feed = await fx.api(outsider, 'GET', `/chat/conversations/${direct.id}/messages`);
    expect(feed.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await feed.json()).code).toBe(ErrorCode.NOT_FOUND);
    const patch = await fx.api(outsider, 'PATCH', `/chat/conversations/${direct.id}`, {
      body: { pinned: true },
    });
    expect(apiErrorResponseSchema.parse(await patch.json()).code).toBe(ErrorCode.NOT_FOUND);
  });
});
