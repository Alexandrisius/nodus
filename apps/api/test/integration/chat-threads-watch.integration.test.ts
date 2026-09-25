import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conversationListItemSchema,
  messageSchema,
  paginatedSchema,
  readConversationResultSchema,
  threadStateListSchema,
  threadWatchResultSchema,
  type ChatMessage,
  type ConversationListItem,
  type Paginated,
} from '@nodus/contracts';

import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Треды: наблюдатели и честная видимость уведомлений (раунд 3). Наблюдатель =
 * кнопка «Следить» | писал в трэде | @упомянут | автор поста. Точка «есть
 * новые» (unreadCount состояния трэда) и вклад ответов в бейдж беседы —
 * ТОЛЬКО наблюдателям; канальный бейдж считают корни + наблюдаемые трэды.
 * Плюс: квитанция из треда (POST /read c threadRootId) гасит точку.
 */
describe.skipIf(!process.env.DATABASE_URL)('chat: трэды — наблюдатели (integration)', () => {
  let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
  let alice: ChatUser;
  let bob: ChatUser;
  let carol: ChatUser;
  let channel: ConversationListItem;
  let root: ChatMessage;
  let keySeq = 0;

  const nextKey = (tag: string): string => `tw-${fx.runId}-${tag}-${(keySeq += 1)}`;

  beforeAll(async () => {
    fx = await setupChatFixture(['alice', 'bob', 'carol']);
    ({ alice, bob, carol } = fx.users);
    const res = await fx.api(alice, 'POST', '/chat/conversations', {
      body: { type: 'project_channel', title: `Треды ${fx.runId}`, memberIds: [bob.id, carol.id] },
      key: nextKey('conv'),
    });
    expect(res.status).toBe(201);
    channel = conversationListItemSchema.parse(await res.json());

    const post = await fx.api(alice, 'POST', `/chat/conversations/${channel.id}/messages`, {
      body: { text: 'Пост канала' },
      key: nextKey('root'),
    });
    expect(post.status).toBe(201);
    root = messageSchema.parse(await post.json());
  }, 120_000);

  afterAll(async () => {
    await fx?.cleanup();
  });

  async function reply(user: ChatUser, text: string): Promise<ChatMessage> {
    const res = await fx.api(user, 'POST', `/chat/conversations/${channel.id}/messages`, {
      body: { text, threadRootId: root.id },
      key: nextKey('reply'),
    });
    expect(res.status).toBe(201);
    return messageSchema.parse(await res.json());
  }

  async function statesOf(user: ChatUser) {
    const res = await fx.api(user, 'GET', `/chat/conversations/${channel.id}/threads/state`);
    expect(res.status).toBe(200);
    return threadStateListSchema.parse(await res.json()).items;
  }

  async function conversationOf(user: ChatUser): Promise<ConversationListItem | undefined> {
    const res = await fx.api(user, 'GET', '/chat/conversations?limit=100');
    const page = paginatedSchema(conversationListItemSchema).parse(
      await res.json(),
    ) as Paginated<ConversationListItem>;
    return page.items.find((c) => c.id === channel.id);
  }

  it('до участия: состояний нет, бейдж канала не видит чужих ответов треда', async () => {
    // 2 чужих для carol ответа в трэде (автор поста alice + отвечавший bob
    // станут участниками) — carol НЕ наблюдатель: ответов в её бейдже нет.
    await reply(alice, 'ответ автора');
    await reply(bob, 'ответ бориса');
    const states = await statesOf(carol);
    expect(states.find((s) => s.threadRootId === root.id)).toBeUndefined();
    const conv = await conversationOf(carol);
    // Пост прочтён квитанцией, чтобы изолировать вклад ответов треда.
    await fx.api(carol, 'POST', `/chat/conversations/${channel.id}/read`, {
      body: { upToSeq: root.seq },
      key: nextKey('read-root'),
    });
    const after = await conversationOf(carol);
    expect(after?.unreadCount).toBe(0);
    expect(conv).toBeDefined();
  });

  it('кнопка «Следить»: toggle добавляет/снимает наблюдателя', async () => {
    const on = await fx.api(
      carol,
      'POST',
      `/chat/conversations/${channel.id}/threads/${root.id}/watch`,
      {
        key: nextKey('watch-on'),
      },
    );
    expect(on.status).toBe(200);
    expect(threadWatchResultSchema.parse(await on.json())).toEqual({ watching: true });

    const states = await statesOf(carol);
    expect(states.find((s) => s.threadRootId === root.id)).toMatchObject({
      watched: true,
      unreadCount: 2, // оба ответа выше её watermark трэда (0)
    });

    const off = await fx.api(
      carol,
      'POST',
      `/chat/conversations/${channel.id}/threads/${root.id}/watch`,
      {
        key: nextKey('watch-off'),
      },
    );
    expect(threadWatchResultSchema.parse(await off.json())).toEqual({ watching: false });
    expect((await statesOf(carol)).find((s) => s.threadRootId === root.id)).toBeUndefined();
  });

  it('реплай делает наблюдателем: чужие ответы считаются в бейдж канала', async () => {
    const mine = await reply(carol, 'карол отвечает — теперь наблюдает');
    expect(mine.threadRootId).toBe(root.id);

    // bob шлёт новый ответ: у carol точка (unreadCount ≥ 1) и вклад в бейдж.
    const unreadBefore = await conversationOf(carol);
    const before = unreadBefore?.unreadCount ?? 0;
    await reply(bob, 'новый ответ после подключения карол');
    const states = await statesOf(carol);
    expect(states.find((s) => s.threadRootId === root.id)?.unreadCount).toBe(1);
    const conv = await conversationOf(carol);
    expect(conv?.unreadCount).toBe(before + 1);
  });

  it('@упоминание делает наблюдателем (точное совпадение имени)', async () => {
    // carol снимает участие реплаем-строкой? Нельзя: реплай уже сделал её
    // участником навсегда до unwatch — используем unwatch кнопкой.
    await fx.api(carol, 'POST', `/chat/conversations/${channel.id}/threads/${root.id}/watch`, {
      key: nextKey('unwatch-again'),
    });
    expect((await statesOf(carol)).find((s) => s.threadRootId === root.id)).toBeUndefined();

    await reply(bob, `вопрос к @${carol.displayName.split(' ')[1]} — глянь`);
    const states = await statesOf(carol);
    expect(states.find((s) => s.threadRootId === root.id)?.watched).toBe(true);
  });

  it('квитанция из треда (threadRootId) гасит точку и двигает watermark беседы', async () => {
    const feed = await fx.api(carol, 'GET', `/chat/conversations/${channel.id}/messages`);
    const items = paginatedSchema(messageSchema)
      .parse(await feed.json())
      .items.filter((m) => !m.deletedAt);
    const upToSeq = items[items.length - 1]!.seq;

    const res = await fx.api(carol, 'POST', `/chat/conversations/${channel.id}/read`, {
      body: { upToSeq, threadRootId: root.id },
      key: nextKey('read-thread'),
    });
    expect(res.status).toBe(200);
    expect(readConversationResultSchema.parse(await res.json()).upToSeq).toBe(upToSeq);

    // Точка погасла; бейдж беседы тоже (всё прочитано).
    const states = await statesOf(carol);
    expect(states.find((s) => s.threadRootId === root.id)?.unreadCount).toBe(0);
    expect((await conversationOf(carol))?.unreadCount).toBe(0);
  });

  it('message_sent несёт полный DTO сообщения в payload (локальное применение)', async () => {
    const sent = await reply(alice, 'dto в payload');
    const event = await fx.prisma.event.findFirst({
      where: { type: 'chat.message_sent', aggregateId: channel.id },
      orderBy: { seq: 'desc' },
    });
    expect(event).not.toBeNull();
    const payload = event!.payload as { messageId: string; message: unknown };
    expect(payload.messageId).toBe(sent.id);
    // DTO валиден контрактом и совпадает в ключевом с ответом эндпоинта.
    const dto = messageSchema.parse(payload.message);
    expect(dto.id).toBe(sent.id);
    expect(dto.seq).toBe(sent.seq);
    expect(dto.text).toBe('dto в payload');
    expect(dto.threadRootId).toBe(root.id);
  });

  it('не-участник беседы: watch/state — 404', async () => {
    // Канал без carol: не раскрываем существование (модель нечлена).
    const privateRes = await fx.api(alice, 'POST', '/chat/conversations', {
      body: { type: 'group', title: `Чужая ${fx.runId}`, memberIds: [bob.id] },
      key: nextKey('private'),
    });
    const privateId = ((await privateRes.json()) as { id: string }).id;
    const state = await fx.api(carol, 'GET', `/chat/conversations/${privateId}/threads/state`);
    expect(state.status).toBe(404);
    const watch = await fx.api(
      carol,
      'POST',
      `/chat/conversations/${privateId}/threads/${root.id}/watch`,
      { key: nextKey('foreign-watch') },
    );
    expect(watch.status).toBe(404);
  });
});
