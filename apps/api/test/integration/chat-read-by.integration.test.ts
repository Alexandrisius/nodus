import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conversationListItemSchema,
  messageSchema,
  paginatedSchema,
  type ChatMessage,
  type Paginated,
} from '@nodus/contracts';

import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Прочитанность по первому прочитавшему (#102, критерий приёмки «1 из 6»):
 * readAt — момент ПЕРВОГО прочитавшего (не «все прочли»), readBy — список
 * прочитавших своих сообщений (растёт по мере открытия беседы), правка
 * исключает прочитавшего до перечитывания. У чужих сообщений readBy пуст.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'chat: readBy/readAt первый прочитавший (integration)',
  () => {
    let fx: ChatTestFixture<'alice' | 'bob' | 'carol' | 'dave' | 'eve' | 'frank'>;
    let alice: ChatUser;
    let bob: ChatUser;
    let carol: ChatUser;
    let conversationId: string;

    beforeAll(async () => {
      fx = await setupChatFixture(['alice', 'bob', 'carol', 'dave', 'eve', 'frank']);
      ({ alice, bob, carol } = fx.users);
      const res = await fx.api(alice, 'POST', '/chat/conversations', {
        body: {
          type: 'group',
          title: `ReadBy ${fx.runId}`,
          memberIds: [bob.id, carol.id, fx.users.dave.id, fx.users.eve.id, fx.users.frank.id],
        },
      });
      expect(res.status).toBe(201); // 6 участников: автор + 5
      conversationId = ((await res.json()) as { id: string }).id;
    }, 120_000);

    afterAll(async () => {
      await fx?.cleanup();
    });

    async function list(user: ChatUser): Promise<ChatMessage[]> {
      const res = await fx.api(user, 'GET', `/chat/conversations/${conversationId}/messages`);
      expect(res.status).toBe(200);
      return paginatedSchema(messageSchema).parse(await res.json()).items;
    }

    let sendSeq = 0;

    async function send(text: string): Promise<ChatMessage> {
      sendSeq += 1; // ключ идемпотентности — ASCII (заголовок не принимает кириллицу)
      const res = await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text },
        key: `readby-${fx.runId}-${sendSeq}`,
      });
      expect(res.status).toBe(201);
      return messageSchema.parse(await res.json());
    }

    it('1 из 6 прочитал → readAt != null, readBy = [первый]; список растёт', async () => {
      const sent = await send('пост для readBy');
      expect(sent.readAt).toBeNull();
      expect(sent.readBy).toEqual([]); // отправка — ещё никто не прочитал

      await list(alice); // автор открывал — не влияет на readBy своих
      let own = (await list(alice)).find((m) => m.id === sent.id)!;
      expect(own.readAt).toBeNull();
      expect(own.readBy).toEqual([]);

      await list(bob); // ПЕРВЫЙ прочитал
      own = (await list(alice)).find((m) => m.id === sent.id)!;
      expect(own.readAt).not.toBeNull(); // галочка сразу (критерий #102)
      expect(own.readBy.map((r) => r.id)).toEqual([bob.id]);

      await list(carol); // второй прочитал — счётчик растёт
      own = (await list(alice)).find((m) => m.id === sent.id)!;
      expect(own.readBy.map((r) => r.id)).toEqual([bob.id, carol.id]); // по времени прочтения

      // Читатель видит ЧУЖОЕ сообщение: readBy пуст (приватность автора).
      const asCarol = (await list(carol)).find((m) => m.id === sent.id)!;
      expect(asCarol.readBy).toEqual([]);
    });

    it('правка исключает прочитавших до перечитывания', async () => {
      const sent = await send('правка readBy');
      await list(bob); // прочитал до правки
      let own = (await list(alice)).find((m) => m.id === sent.id)!;
      expect(own.readBy.map((r) => r.id)).toEqual([bob.id]);

      const patch = await fx.api(
        alice,
        'PATCH',
        `/chat/conversations/${conversationId}/messages/${sent.id}`,
        {
          body: { text: 'правка readBy (изменено)' },
        },
      );
      expect(patch.status).toBe(200);

      own = (await list(alice)).find((m) => m.id === sent.id)!;
      expect(own.readAt).toBeNull(); // «повторный пуш прочитавшим» (#41)
      expect(own.readBy).toEqual([]);

      await list(carol); // перечитал после правки → единственный прочитавший
      own = (await list(alice)).find((m) => m.id === sent.id)!;
      expect(own.readBy.map((r) => r.id)).toEqual([carol.id]);
    });

    it('conversationListItemSchema совместим (readBy в lastMessage не ломает список)', async () => {
      const res = await fx.api(alice, 'GET', '/chat/conversations?limit=100');
      expect(res.status).toBe(200);
      const page = paginatedSchema(conversationListItemSchema).parse(
        await res.json(),
      ) as Paginated<unknown>;
      expect(page.items.some((c) => (c as { id: string }).id === conversationId)).toBe(true);
    });
  },
);
