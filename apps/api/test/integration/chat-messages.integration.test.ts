import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  chatMessageDeletedPayloadSchema,
  chatMessageEditedPayloadSchema,
  chatMessageReadPayloadSchema,
  chatMessageSentPayloadSchema,
  ErrorCode,
  messagePinSchema,
  messageSchema,
  paginatedSchema,
  type ChatMessage,
} from '@nodus/contracts';

import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Контракт сообщений на живом HTTP (критерий приёмки #58): лента с курсором
 * назад без потерь и дублей, треды одного уровня, правка/удаление (правило
 * следа), закрепы, реакции, пересылка и события outbox (I9) в таблице events.
 */
// > 300 строк: 10 кейсов контракта в одном наборе — длина осознанная (I5).

describe.skipIf(!process.env.DATABASE_URL)('chat: сообщения (integration)', () => {
  let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
  let alice: ChatUser;
  let bob: ChatUser;
  let carol: ChatUser;
  let nextConv = 0;

  beforeAll(async () => {
    fx = await setupChatFixture(['alice', 'bob', 'carol']);
    ({ alice, bob, carol } = fx.users);
  }, 120_000);

  afterAll(async () => {
    await fx?.cleanup();
  });

  /** Свежая группа на каждый кейс (изоляция состояний прочтённости). */
  async function makeGroup(): Promise<string> {
    nextConv += 1;
    const res = await fx.api(alice, 'POST', '/chat/conversations', {
      body: {
        type: 'group',
        title: `Сообщения ${fx.runId}-${nextConv}`,
        memberIds: [bob.id, carol.id],
      },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    return created.id;
  }

  async function send(user: ChatUser, conversationId: string, body: object): Promise<ChatMessage> {
    const res = await fx.api(user, 'POST', `/chat/conversations/${conversationId}/messages`, {
      body,
    });
    expect(res.status).toBe(201);
    return messageSchema.parse(await res.json());
  }

  async function feed(
    user: ChatUser,
    conversationId: string,
    query = '',
  ): Promise<{ items: ChatMessage[]; nextCursor: string | null }> {
    const res = await fx.api(user, 'GET', `/chat/conversations/${conversationId}/messages${query}`);
    expect(res.status).toBe(200);
    return paginatedSchema(messageSchema).parse(await res.json());
  }

  it('лента: ASC в странице, курсор назад по 2 сообщения без потерь и дублей', async () => {
    const conv = await makeGroup();
    const sent: ChatMessage[] = [];
    for (let i = 1; i <= 7; i += 1) {
      sent.push(await send(alice, conv, { text: `сообщение-${i}` }));
    }

    const all = await feed(bob, conv, '?limit=100');
    expect(all.items.map((m) => m.text)).toEqual(sent.map((m) => m.text)); // ASC, весь набор
    expect(all.nextCursor).toBeNull();

    // Пагинация назад страницами по 2: страницы ASC, مجموع — все 7 без дублей.
    const indexById = new Map(sent.map((m, i) => [m.id, i]));
    let cursor: string | null = null;
    const pages: number[][] = [];
    do {
      const query = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await feed(carol, conv, query);
      pages.push(page.items.map((m) => indexById.get(m.id)!));
      cursor = page.nextCursor;
    } while (cursor);

    expect(pages).toEqual([[5, 6], [3, 4], [1, 2], [0]]); // страницы новее→старее, внутри ASC
    expect(new Set(pages.flat()).size).toBe(7);
  });

  it('тред: лента содержит ВСЕ сообщения ASC (ответы инлайн — мок-контракт); выдача треда — корень первым + ответы ASC', async () => {
    const conv = await makeGroup();
    const root = await send(alice, conv, { text: 'корень' });
    const reply1 = await send(bob, conv, { text: 'ответ-1', threadRootId: root.id });
    const reply2 = await send(carol, conv, { text: 'ответ-2', threadRootId: root.id });

    // Мок возвращает всё; канальный вид фильтрует корни на клиенте
    // (thread-feed.tsx), прямой/групповой рендерит ответы инлайн.
    const main = await feed(alice, conv, '?limit=100');
    expect(main.items.map((m) => m.id)).toEqual([root.id, reply1.id, reply2.id]);
    expect(main.items.find((m) => m.id === root.id)?.threadRepliesCount).toBe(2);

    const thread = await feed(bob, conv, `?threadRootId=${root.id}&limit=50`);
    expect(thread.items.map((m) => m.id)).toEqual([root.id, reply1.id, reply2.id]);
    expect(thread.items[1]!.threadRootId).toBe(root.id);
    expect(thread.items[1]!.threadRepliesCount).toBe(0);
    expect(thread.items[0]!.threadRepliesCount).toBe(2);
  });

  it('«тред в треде» запрещён: ответ на ответ → 404 NOT_FOUND', async () => {
    const conv = await makeGroup();
    const root = await send(alice, conv, { text: 'корень' });
    const reply = await send(bob, conv, { text: 'ответ', threadRootId: root.id });

    const res = await fx.api(carol, 'POST', `/chat/conversations/${conv}/messages`, {
      body: { text: 'вложенный ответ', threadRootId: reply.id },
    });
    expect(res.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await res.json()).code).toBe(ErrorCode.NOT_FOUND);
  });

  it('правка: editedAt при смене текста; тот же текст — нет; не-автор — FORBIDDEN', async () => {
    const conv = await makeGroup();
    const message = await send(alice, conv, { text: 'исходный текст' });
    const editUrl = `/chat/conversations/${conv}/messages/${message.id}`;

    const same = await fx.api(alice, 'PATCH', editUrl, { body: { text: 'исходный текст' } });
    expect(same.status).toBe(200);
    expect(messageSchema.parse(await same.json()).editedAt).toBeNull();

    const changed = await fx.api(alice, 'PATCH', editUrl, { body: { text: 'правленый текст' } });
    expect(changed.status).toBe(200);
    expect(messageSchema.parse(await changed.json()).editedAt).not.toBeNull();

    const foreign = await fx.api(bob, 'PATCH', editUrl, { body: { text: 'взлом' } });
    expect(foreign.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await foreign.json()).code).toBe(ErrorCode.FORBIDDEN);
  });

  it('правка надгробия → NOT_FOUND', async () => {
    const conv = await makeGroup();
    const message = await send(alice, conv, { text: 'будет удалён' });
    await feed(bob, conv, '?limit=50'); // прочитан → удаление оставит надгробие
    await fx.api(alice, 'DELETE', `/chat/conversations/${conv}/messages/${message.id}`);

    const res = await fx.api(alice, 'PATCH', `/chat/conversations/${conv}/messages/${message.id}`, {
      body: { text: 'воскресни' },
    });
    expect(res.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await res.json()).code).toBe(ErrorCode.NOT_FOUND);
  });

  it('удаление: непрочитанное исчезает (obliterated), прочитанное — надгробие', async () => {
    // Непрочитанное: 204, из ленты исчезло, строка в БД obliterated.
    const conv1 = await makeGroup();
    const unread = await send(alice, conv1, { text: 'никто не видел' });
    const del1 = await fx.api(
      alice,
      'DELETE',
      `/chat/conversations/${conv1}/messages/${unread.id}`,
    );
    expect(del1.status).toBe(204);
    expect(await del1.text()).toBe('');
    expect((await feed(bob, conv1, '?limit=50')).items.map((m) => m.id)).not.toContain(unread.id);
    const row1 = await fx.prisma.message.findUniqueOrThrow({ where: { id: unread.id } });
    expect(row1.obliterated).toBe(true);
    expect(row1.deletedAt).not.toBeNull();

    // Прочитанное получателем: 200 надгробие, в ленте остаётся с пустым текстом.
    const conv2 = await makeGroup();
    const read = await send(alice, conv2, { text: 'уже прочитано' });
    await feed(bob, conv2, '?limit=50');
    const del2 = await fx.api(alice, 'DELETE', `/chat/conversations/${conv2}/messages/${read.id}`);
    expect(del2.status).toBe(200);
    const tombstone = messageSchema.parse(await del2.json());
    expect(tombstone.id).toBe(read.id);
    expect(tombstone.deletedAt).not.toBeNull();
    expect(tombstone.text).toBe('');
    expect(tombstone.attachments).toEqual([]);
    expect(tombstone.reactions).toEqual([]);

    const after = await feed(bob, conv2, '?limit=50');
    const tombInFeed = after.items.find((m) => m.id === read.id);
    expect(tombInFeed?.deletedAt).not.toBeNull();
    expect(tombInFeed?.text).toBe('');
    const row2 = await fx.prisma.message.findUniqueOrThrow({ where: { id: read.id } });
    expect(row2.obliterated).toBe(false);
  });

  it('закрепы: pin/unpin/listPins; пин надгробия → NOT_FOUND; удаление снимает пин', async () => {
    const conv = await makeGroup();
    const m1 = await send(alice, conv, { text: 'первое' });
    const pinRes = await fx.api(bob, 'POST', `/chat/conversations/${conv}/messages/${m1.id}/pin`);
    expect(pinRes.status).toBe(201);
    const pin = messagePinSchema.parse(await pinRes.json());
    expect(pin.message.id).toBe(m1.id);
    expect(pin.pinnedBy.id).toBe(bob.id);

    const pins = paginatedSchema(messagePinSchema).parse(
      await (await fx.api(alice, 'GET', `/chat/conversations/${conv}/pins`)).json(),
    );
    expect(pins.items.map((p) => p.message.id)).toEqual([m1.id]);

    // Надгробие закрепить нельзя.
    const m2 = await send(alice, conv, { text: 'погибнет' });
    await feed(bob, conv, '?limit=50');
    await fx.api(alice, 'DELETE', `/chat/conversations/${conv}/messages/${m2.id}`);
    const pinDead = await fx.api(bob, 'POST', `/chat/conversations/${conv}/messages/${m2.id}/pin`);
    expect(pinDead.status).toBe(404);

    // Удаление закреплённого снимает закреп.
    const m3 = await send(carol, conv, { text: 'закрепим и удалим' });
    const pin3 = await fx.api(alice, 'POST', `/chat/conversations/${conv}/messages/${m3.id}/pin`);
    expect(pin3.status).toBe(201);
    await fx.api(carol, 'DELETE', `/chat/conversations/${conv}/messages/${m3.id}`);
    const afterDelete = paginatedSchema(messagePinSchema).parse(
      await (await fx.api(alice, 'GET', `/chat/conversations/${conv}/pins`)).json(),
    );
    expect(afterDelete.items.map((p) => p.message.id)).toEqual([m1.id]);

    // Unpin: 204, повтор — 404.
    const unpin = await fx.api(bob, 'DELETE', `/chat/conversations/${conv}/messages/${m1.id}/pin`);
    expect(unpin.status).toBe(204);
    expect(
      paginatedSchema(messagePinSchema).parse(
        await (await fx.api(alice, 'GET', `/chat/conversations/${conv}/pins`)).json(),
      ).items,
    ).toHaveLength(0);
    const unpinAgain = await fx.api(
      bob,
      'DELETE',
      `/chat/conversations/${conv}/messages/${m1.id}/pin`,
    );
    expect(unpinAgain.status).toBe(404);
  });

  it('реакции: toggle add/remove, mine/count в DTO сообщения', async () => {
    const conv = await makeGroup();
    const message = await send(alice, conv, { text: 'реагируй' });
    const url = `/chat/conversations/${conv}/messages/${message.id}/reactions`;

    const byBob = await fx.api(bob, 'POST', url, { body: { emoji: '👍' } });
    expect(byBob.status).toBe(200);
    expect(messageSchema.parse(await byBob.json()).reactions).toEqual([
      { emoji: '👍', count: 1, mine: true },
    ]);

    const byAlice = await fx.api(alice, 'POST', url, { body: { emoji: '👍' } });
    expect(messageSchema.parse(await byAlice.json()).reactions).toEqual([
      { emoji: '👍', count: 2, mine: true },
    ]);

    const removed = await fx.api(bob, 'POST', url, { body: { emoji: '👍', remove: true } });
    expect(messageSchema.parse(await removed.json()).reactions).toEqual([
      { emoji: '👍', count: 1, mine: false },
    ]);

    // Повтор своей же реакции не плодит дубль; вторая эмодзи — отдельной группой.
    await fx.api(carol, 'POST', url, { body: { emoji: '🎉' } });
    const both = messageSchema.parse(
      await (await fx.api(alice, 'POST', url, { body: { emoji: '👍' } })).json(),
    );
    expect(both.reactions.find((r) => r.emoji === '👍')).toMatchObject({ count: 1, mine: true });
    expect(both.reactions.find((r) => r.emoji === '🎉')).toMatchObject({ count: 1, mine: false });
    expect(
      await fx.prisma.messageReaction.count({ where: { messageId: message.id, emoji: '👍' } }),
    ).toBe(1);
  });

  it('пересылка: комментарий перед копиями, порядок/seq/createdAt монотонны, атрибуция', async () => {
    const src = await makeGroup();
    const dst = await makeGroup();
    const s1 = await send(alice, src, { text: 'раз' });
    const s2 = await send(bob, src, { text: 'два' });
    const s3 = await send(carol, src, { text: 'три' });

    const res = await fx.api(alice, 'POST', `/chat/conversations/${dst}/forward`, {
      body: {
        sourceConversationId: src,
        messageIds: [s1.id, s2.id, s3.id],
        comment: 'Смотрите сюда',
      },
    });
    expect(res.status).toBe(201);
    const copies = (await res.json()) as ChatMessage[];
    expect(copies).toHaveLength(4);

    expect(copies[0]).toMatchObject({ text: 'Смотрите сюда', forwardedFrom: null });
    expect(copies[0]!.author.id).toBe(alice.id);
    expect(copies[1]!.text).toBe('раз');
    expect(copies[1]!.forwardedFrom).toMatchObject({ messageId: s1.id, conversationId: src });
    expect(copies[1]!.forwardedFrom!.author.id).toBe(alice.id); // автор оригинала
    expect(copies[2]!.text).toBe('два');
    expect(copies[2]!.forwardedFrom!.messageId).toBe(s2.id);
    expect(copies[2]!.forwardedFrom!.author.id).toBe(bob.id);
    expect(copies[3]!.text).toBe('три');
    expect(copies.slice(1).every((c) => c.author.id === alice.id)).toBe(true); // копии пересылает alice

    // seq и createdAt строго монотонны по блоку.
    const rows = await fx.prisma.message.findMany({
      where: { id: { in: copies.map((c) => c.id) } },
    });
    const seqById = new Map(rows.map((r) => [r.id, Number(r.seq)]));
    const seqs = copies.map((c) => seqById.get(c.id)!);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    for (let i = 1; i < copies.length; i += 1) {
      expect(copies[i]!.createdAt >= copies[i - 1]!.createdAt).toBe(true);
    }
  });

  it('пересылка: не член исходной беседы → NOT_FOUND (не раскрываем чужое)', async () => {
    // src без carol; carol — член dst: пересылка из беседы, где её нет, = 404.
    const srcRes = await fx.api(alice, 'POST', '/chat/conversations', {
      body: {
        type: 'group',
        title: `Только Алиса и Боб ${fx.runId}-src-private`,
        memberIds: [bob.id],
      },
    });
    expect(srcRes.status).toBe(201);
    const src = ((await srcRes.json()) as { id: string }).id;
    const secret = await send(alice, src, { text: 'внутреннее' });
    const dst = await makeGroup();

    const res = await fx.api(carol, 'POST', `/chat/conversations/${dst}/forward`, {
      body: { sourceConversationId: src, messageIds: [secret.id] },
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('NOT_FOUND');
    // В dst ничего не появилось.
    const dstFeed = await feed(carol, dst, '?limit=50');
    expect(dstFeed.items).toHaveLength(0);
  });

  it('пересылка пропускает надгробия; всё пропущено без комментария → NOT_FOUND', async () => {
    const src = await makeGroup();
    const dst = await makeGroup();
    const alive = await send(alice, src, { text: 'живое' });
    const dead = await send(alice, src, { text: 'погибнёт' });
    await feed(bob, src, '?limit=50'); // прочитано → останется надгробием
    await fx.api(alice, 'DELETE', `/chat/conversations/${src}/messages/${dead.id}`);

    const res = await fx.api(alice, 'POST', `/chat/conversations/${dst}/forward`, {
      body: { sourceConversationId: src, messageIds: [alive.id, dead.id], comment: 'коммент' },
    });
    expect(res.status).toBe(201);
    const copies = (await res.json()) as ChatMessage[];
    expect(copies).toHaveLength(2); // комментарий + копия только живого
    expect(copies[1]!.forwardedFrom!.messageId).toBe(alive.id);

    const empty = await fx.api(alice, 'POST', `/chat/conversations/${dst}/forward`, {
      body: { sourceConversationId: src, messageIds: [dead.id] },
    });
    expect(empty.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await empty.json()).code).toBe(ErrorCode.NOT_FOUND);
  });

  it('события outbox: sent/edited/deleted/read пишутся с контрактным payload', async () => {
    const conv = await makeGroup();
    const message = await send(alice, conv, { text: 'событийное сообщение' });
    const eventsOf = (type: string) =>
      fx.prisma.event.findMany({
        where: { type, aggregateType: 'conversation', aggregateId: conv },
      });

    const sentEvents = await eventsOf('chat.message_sent');
    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0]!.aggregateType).toBe('conversation');
    expect(chatMessageSentPayloadSchema.parse(sentEvents[0]!.payload)).toEqual({
      conversationId: conv,
      messageId: message.id,
      seq: 1,
      authorId: alice.id,
      threadRootId: null,
      forwarded: false,
    });

    const editUrl = `/chat/conversations/${conv}/messages/${message.id}`;
    await fx.api(alice, 'PATCH', editUrl, { body: { text: 'событийное сообщение' } }); // без смены
    expect(await eventsOf('chat.message_edited')).toHaveLength(0);

    const edited = await fx.api(alice, 'PATCH', editUrl, { body: { text: 'событийное (правка)' } });
    const editedAt = messageSchema.parse(await edited.json()).editedAt!;
    const editedEvents = await eventsOf('chat.message_edited');
    expect(editedEvents).toHaveLength(1);
    expect(chatMessageEditedPayloadSchema.parse(editedEvents[0]!.payload)).toEqual({
      conversationId: conv,
      messageId: message.id,
      editedAt,
    });

    await feed(bob, conv, '?limit=50'); // read-GET продвигает курсор → событие
    const readEvents = await eventsOf('chat.message_read');
    expect(readEvents).toHaveLength(1);
    expect(chatMessageReadPayloadSchema.parse(readEvents[0]!.payload)).toMatchObject({
      conversationId: conv,
      userId: bob.id,
      upToSeq: 1,
    });

    await fx.api(alice, 'DELETE', editUrl); // прочитано bob → надгробие
    const deletedEvents = await eventsOf('chat.message_deleted');
    expect(deletedEvents).toHaveLength(1);
    expect(chatMessageDeletedPayloadSchema.parse(deletedEvents[0]!.payload)).toEqual({
      conversationId: conv,
      messageId: message.id,
      obliterated: false,
    });
  });
});
