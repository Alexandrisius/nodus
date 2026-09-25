import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conversationListItemSchema,
  messageSchema,
  paginatedSchema,
  readConversationResultSchema,
  type ChatMessage,
  type Paginated,
} from '@nodus/contracts';

import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Просмотр = видимость в вьюпорте (#102 раунд 2): выдача ленты курсор прочтения
 * НЕ двигает (открытый чат не «прочитывает» спрятанное за прокруткой);
 * квитанция POST /read двигает watermark до upToSeq (GREATEST, кламп к
 * last_seq), повтор/отставшая квитанция — тихие, не-участник — 404.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'chat: просмотры по вьюпорту — POST /read (integration)',
  () => {
    let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
    let alice: ChatUser;
    let bob: ChatUser;
    let conversationId: string;
    let lastSeq = 0;

    beforeAll(async () => {
      fx = await setupChatFixture(['alice', 'bob', 'carol']);
      ({ alice, bob } = fx.users);
      const res = await fx.api(alice, 'POST', '/chat/conversations', {
        body: { type: 'group', title: `Viewport ${fx.runId}`, memberIds: [bob.id] },
        key: `vp-${fx.runId}-conv`,
      });
      expect(res.status).toBe(201);
      conversationId = ((await res.json()) as { id: string }).id;

      for (let i = 1; i <= 20; i += 1) {
        const sent = await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
          body: { text: `строка ${i}` },
          key: `vp-${fx.runId}-m${i}`,
        });
        expect(sent.status).toBe(201);
        lastSeq = Math.max(lastSeq, messageSchema.parse(await sent.json()).seq);
      }
      expect(lastSeq).toBe(20);
    }, 120_000);

    afterAll(async () => {
      await fx?.cleanup();
    });

    async function feedAs(user: ChatUser): Promise<ChatMessage[]> {
      const res = await fx.api(user, 'GET', `/chat/conversations/${conversationId}/messages`);
      expect(res.status).toBe(200);
      return paginatedSchema(messageSchema).parse(await res.json()).items;
    }

    async function unreadOf(user: ChatUser): Promise<number> {
      const res = await fx.api(user, 'GET', '/chat/conversations?limit=100');
      const page = paginatedSchema(conversationListItemSchema).parse(
        await res.json(),
      ) as Paginated<{ id: string; unreadCount: number }>;
      return page.items.find((c) => c.id === conversationId)?.unreadCount ?? -1;
    }

    async function receipt(user: ChatUser, upToSeq: number, key: string): Promise<number> {
      const res = await fx.api(user, 'POST', `/chat/conversations/${conversationId}/read`, {
        body: { upToSeq },
        key,
      });
      expect(res.status).toBe(200);
      return readConversationResultSchema.parse(await res.json()).upToSeq;
    }

    it('открытие беседы (GET ленты) НЕ прочитывает: watermark и unread на месте', async () => {
      await feedAs(bob); // «открыл чат» — 20 строк приехало, квитанции не было
      expect(await unreadOf(bob)).toBe(20);
      const own = (await feedAs(alice)).find((m) => m.seq === 1)!;
      expect(own.readAt).toBeNull();
      expect(own.readBy).toEqual([]);
    });

    it('квитанция видимой части (upToSeq=7): прочитано только видимое', async () => {
      expect(await receipt(bob, 7, `vp-${fx.runId}-r1`)).toBe(7);
      expect(await unreadOf(bob)).toBe(13);

      const feed = await feedAs(alice);
      const visible = feed.find((m) => m.seq === 7)!;
      const hidden = feed.find((m) => m.seq === 8)!;
      expect(visible.readBy.map((r) => r.id)).toEqual([bob.id]);
      expect(visible.readAt).not.toBeNull();
      expect(hidden.readAt).toBeNull();
      expect(hidden.readBy).toEqual([]);
    });

    it('докрутил до низа (upToSeq=20) → дочиталось; повтор и отставшая квитанция — тихие', async () => {
      expect(await receipt(bob, 20, `vp-${fx.runId}-r2`)).toBe(20);
      expect(await unreadOf(bob)).toBe(0);
      const all = (await feedAs(alice)).find((m) => m.seq === 20)!;
      expect(all.readBy.map((r) => r.id)).toEqual([bob.id]);

      const events = await fx.prisma.event.count({
        where: { type: 'chat.message_read', aggregateId: conversationId },
      });
      expect(await receipt(bob, 20, `vp-${fx.runId}-r3`)).toBe(20); // дубль
      expect(await receipt(bob, 5, `vp-${fx.runId}-r4`)).toBe(5); // stale-устройство
      const eventsAfter = await fx.prisma.event.count({
        where: { type: 'chat.message_read', aggregateId: conversationId },
      });
      expect(eventsAfter).toBe(events); // без движения — без событий
    });

    it('кламп к last_seq: фантомное upToSeq не прочитывает будущее', async () => {
      expect(await receipt(bob, 999_999, `vp-${fx.runId}-r5`)).toBe(lastSeq);
      // watermark и так на lastSeq — события нет, изменений не видно
      expect(await unreadOf(bob)).toBe(0);
    });

    it('не-участник → 404 (существование беседы не раскрываем)', async () => {
      const res = await fx.api(
        fx.users.carol,
        'POST',
        `/chat/conversations/${conversationId}/read`,
        {
          body: { upToSeq: 1 },
          key: `vp-${fx.runId}-foreign`,
        },
      );
      expect(res.status).toBe(404);
    });

    it('идемпотентность: повтор того же ключа — тот же результат без второго события', async () => {
      const first = await fx.api(bob, 'POST', `/chat/conversations/${conversationId}/read`, {
        body: { upToSeq: 20 },
        key: `vp-${fx.runId}-idem`,
      });
      expect(first.status).toBe(200);
      const replay = await fx.api(bob, 'POST', `/chat/conversations/${conversationId}/read`, {
        body: { upToSeq: 20 },
        key: `vp-${fx.runId}-idem`,
      });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(await first.json());
    });
  },
);
