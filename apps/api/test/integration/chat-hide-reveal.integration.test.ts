import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conversationListItemSchema, paginatedSchema, type Paginated } from '@nodus/contracts';

import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * «Скрыть» по модели Битрикс24 (#103, критерии приёмки): активность (своя/
 * чужая отправка, пересылка) раскрывает беседу у ВСЕХ скрывших её участников
 * — в той же транзакции; клик по человеку в поиске людей возвращает личку в
 * список (PATCH hidden:false после find-or-create). Серверный ?search=
 * скрытые по-прежнему исключает.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'chat: скрытая беседа раскрывается активностью (integration)',
  () => {
    let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
    let alice: ChatUser;
    let bob: ChatUser;
    let carol: ChatUser;

    beforeAll(async () => {
      fx = await setupChatFixture(['alice', 'bob', 'carol']);
      ({ alice, bob, carol } = fx.users);
    }, 120_000);

    afterAll(async () => {
      await fx?.cleanup();
    });

    async function listIds(user: ChatUser): Promise<string[]> {
      const res = await fx.api(user, 'GET', '/chat/conversations?limit=100');
      expect(res.status).toBe(200);
      const page = paginatedSchema(conversationListItemSchema).parse(
        await res.json(),
      ) as Paginated<{ id: string; unreadCount: number }>;
      return page.items.map((c) => c.id);
    }

    async function createGroup(title: string): Promise<string> {
      const res = await fx.api(alice, 'POST', '/chat/conversations', {
        body: { type: 'group', title, memberIds: [bob.id, carol.id] },
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    }

    async function send(user: ChatUser, conversationId: string, seq: string): Promise<Response> {
      return fx.api(user, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: `reveal ${seq}` },
        key: `reveal-${fx.runId}-${seq}`,
      });
    }

    it('группу скрыли оба → активность любого возвращает её обоим (с бейджем у получателя)', async () => {
      const conv = await createGroup(`Reveal group ${fx.runId}`);
      // Отправка alice создаёт lastMessage; оба читают, чтобы превью было чистым.
      await send(alice, conv, 'warm');
      await listIds(bob);
      await listIds(carol);

      for (const user of [alice, bob]) {
        const patch = await fx.api(user, 'PATCH', `/chat/conversations/${conv}`, {
          body: { hidden: true },
        });
        expect(patch.status).toBe(200);
      }
      expect((await listIds(alice)).includes(conv)).toBe(false);
      expect((await listIds(bob)).includes(conv)).toBe(false);

      // Чужая отправка (carol не скрывал) — раскрывает беседу СКРЫВШИМ (alice, bob).
      const sent = await send(carol, conv, 'activity');
      expect(sent.status).toBe(201);

      expect((await listIds(alice)).includes(conv)).toBe(true);
      expect((await listIds(bob)).includes(conv)).toBe(true);
      // Бейдж непрочитанного у получателя со скрытой ранее беседой.
      const res = await fx.api(bob, 'GET', '/chat/conversations?limit=100');
      const page = paginatedSchema(conversationListItemSchema).parse(await res.json());
      const item = page.items.find((c) => c.id === conv);
      expect(item?.unreadCount).toBeGreaterThan(0);
    });

    it('своя отправка тоже раскрывает (скрыл → написал → вернулась)', async () => {
      const conv = await createGroup(`Reveal self ${fx.runId}`);
      await send(alice, conv, 'self-warm');
      await listIds(alice);
      const patch = await fx.api(alice, 'PATCH', `/chat/conversations/${conv}`, {
        body: { hidden: true },
      });
      expect(patch.status).toBe(200);
      expect((await listIds(alice)).includes(conv)).toBe(false);

      expect((await send(alice, conv, 'self-activity')).status).toBe(201);
      expect((await listIds(alice)).includes(conv)).toBe(true);
    });

    it('пересылка в скрытую беседу раскрывает её', async () => {
      const source = await createGroup(`Reveal src ${fx.runId}`);
      const sent = await send(alice, source, 'fwd-src');
      const message = (await sent.json()) as { id: string };
      const target = await createGroup(`Reveal tgt ${fx.runId}`);
      await send(alice, target, 'tgt-warm');
      const patch = await fx.api(alice, 'PATCH', `/chat/conversations/${target}`, {
        body: { hidden: true },
      });
      expect(patch.status).toBe(200);
      expect((await listIds(alice)).includes(target)).toBe(false);

      const fwd = await fx.api(alice, 'POST', `/chat/conversations/${target}/forward`, {
        body: { sourceConversationId: source, messageIds: [message.id], comment: 'переслал' },
        key: `reveal-${fx.runId}-fwd`,
      });
      expect(fwd.status).toBe(201);
      expect((await listIds(alice)).includes(target)).toBe(true);
    });

    it('поиск людей: клик возвращает скрытую личку в список (find-or-create + PATCH)', async () => {
      const direct = await fx.api(alice, 'GET', `/chat/conversations/direct/${bob.id}`);
      expect([200, 201]).toContain(direct.status); // 200 существующая / 201 созданная
      const conversation = (await direct.json()) as { id: string };
      await send(alice, conversation.id, 'direct-warm');
      await listIds(alice);
      await fx.api(alice, 'PATCH', `/chat/conversations/${conversation.id}`, {
        body: { hidden: true },
      });
      expect((await listIds(alice)).includes(conversation.id)).toBe(false);

      // Сценарий клиента (#103): find-or-create → PATCH hidden:false → список.
      const again = await fx.api(alice, 'GET', `/chat/conversations/direct/${bob.id}`);
      expect(again.status).toBe(200);
      const patch = await fx.api(alice, 'PATCH', `/chat/conversations/${conversation.id}`, {
        body: { hidden: false },
      });
      expect(patch.status).toBe(200);
      expect((await listIds(alice)).includes(conversation.id)).toBe(true);
    });

    it('серверный ?search= скрытые по-прежнему исключает (скрытое не ищется)', async () => {
      const conv = await createGroup(`Reveal search ${fx.runId}`);
      await send(alice, conv, 'search-warm');
      await fx.api(alice, 'PATCH', `/chat/conversations/${conv}`, {
        body: { hidden: true },
      });
      const res = await fx.api(
        alice,
        'GET',
        `/chat/conversations?search=${encodeURIComponent(`Reveal search ${fx.runId}`)}`,
      );
      const page = paginatedSchema(conversationListItemSchema).parse(await res.json());
      expect(page.items.some((c) => c.id === conv)).toBe(false);
    });
  },
);
