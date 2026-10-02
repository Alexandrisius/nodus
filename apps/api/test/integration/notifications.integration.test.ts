import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOMAIN_EVENTS_STREAM,
  realtimeEnvelopeSchema,
  type RealtimeEnvelope,
} from '@nodus/contracts';

import { EventDispatcher } from '../../src/core/events/event-dispatcher.js';
import { RedisStreamPublisher } from '../../src/core/events/redis-stream-publisher.js';
import { UrgentRepeatWorker } from '../../src/modules/notifications/urgent-repeat.worker.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Конвейер уведомлений #100 на живом стеке (Ф2-гейт): REST-отправка →
 * outbox `events` → EventDispatcher (журнал `notifications` + событие
 * dispatch_requested) → RedisStreamPublisher (общий стрим; консьюмер —
 * WS-gateway, маршрутизацию в user-комнату покрывает gateway/fanout.test).
 * Плюс: приоритеты (mention/direct/low/mute), urgent+лимит, повтор воркером,
 * стоп-условия, ack-аналитика, дедуп повтора события (D4), идемпотентность
 * журнал доставок (D6/C11), правка сообщения (#189).
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'notifications: конвейер журнал+стрим (integration)',
  () => {
    let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
    let alice: ChatUser;
    let bob: ChatUser;
    let carol: ChatUser;
    let dispatcher: EventDispatcher;
    let publisher: RedisStreamPublisher;
    let urgentWorker: UrgentRepeatWorker;
    let prisma: PrismaService;
    const publishedIds: string[] = [];

    beforeAll(async () => {
      fx = await setupChatFixture(['alice', 'bob', 'carol']);
      ({ alice, bob, carol } = fx.users);
      dispatcher = fx.app.get(EventDispatcher);
      publisher = fx.app.get(RedisStreamPublisher);
      urgentWorker = fx.app.get(UrgentRepeatWorker);
      prisma = fx.app.get(PrismaService);
    }, 120_000);

    afterAll(async () => {
      for (const id of publishedIds) {
        await fx?.redis.xdel(DOMAIN_EVENTS_STREAM, id);
      }
      await fx?.cleanup();
    });

    /** Прогнать конвейер до событий второго порядка (журнал → будило →
     *  журнал доставок): диспетчер и издатель — по два раунда. */
    async function runPipeline(): Promise<void> {
      for (let round = 0; round < 2; round += 1) {
        await dispatcher.dispatchPending();
        await publisher.publishPending();
      }
    }

    /** Найти в стриме первый envelope заданного notification-типа для user. */
    async function findNotificationEnvelope(
      type: string,
      userId: string,
      attempt?: number,
    ): Promise<{ id: string; envelope: RealtimeEnvelope } | null> {
      let cursor = '-';
      for (;;) {
        const batch = (await fx.redis.xrange(DOMAIN_EVENTS_STREAM, cursor, '+', 'COUNT', 200)) as [
          string,
          string[],
        ][];
        if (batch.length === 0) return null;
        for (const [id, fields] of batch) {
          const raw = fields[fields.indexOf('envelope') + 1];
          if (!raw) continue;
          const envelope = realtimeEnvelopeSchema.parse(JSON.parse(raw));
          if (envelope.type !== type) continue;
          const payload = envelope.payload as Record<string, unknown>;
          const snapshot = payload.snapshot as Record<string, unknown> | undefined;
          const target = (payload.userId as string) ?? snapshot?.userId;
          if (target !== userId) continue;
          if (attempt !== undefined && payload.attempt !== attempt) continue;
          return { id, envelope };
        }
        const lastId = batch[batch.length - 1]![0];
        if (batch.length < 200) return null;
        cursor = `(${lastId}`;
      }
    }

    async function listNotifications(user: ChatUser, query = ''): Promise<Response> {
      return fx.api(user, 'GET', `/notifications${query}`);
    }

    /** Find-or-create личной беседы (GET /direct/:userId, канон чата). */
    async function directId(user: ChatUser, peer: ChatUser): Promise<string> {
      const res = await fx.api(user, 'GET', `/chat/conversations/direct/${peer.id}`);
      expect([200, 201]).toContain(res.status);
      return ((await res.json()) as { id: string }).id;
    }

    it('A2/B2: упоминание — high упомянутому, low — остальным; оба в стриме', async () => {
      const res = await fx.api(alice, 'POST', '/chat/conversations', {
        body: { type: 'group', title: `Notif ${fx.runId}`, memberIds: [bob.id, carol.id] },
      });
      expect(res.status).toBe(201);
      const conversationId = ((await res.json()) as { id: string }).id;

      // Упоминание по ИМЕНИ: фамилии фикстурных пользователей прогона общие
      // («Чатов<runId>»), displayName-токен с пробелом парсер не берёт.
      await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: '@Борис, посмотри чертежи' },
        key: `notif-m-${fx.runId}`,
      });
      await runPipeline();

      const bobList = (await (await listNotifications(bob, '?filter=unread')).json()) as {
        items: Array<{ priority: string; kind: string; conversationId: string }>;
      };
      const mention = bobList.items.find((i) => i.conversationId === conversationId);
      expect(mention?.priority).toBe('high');
      expect(mention?.kind).toBe('chat.mention');

      const carolList = (await (await listNotifications(carol, '?filter=low')).json()) as {
        items: Array<{ priority: string; conversationId: string }>;
      };
      expect(carolList.items.some((i) => i.conversationId === conversationId)).toBe(true);

      const envelope = await findNotificationEnvelope('notification.dispatch_requested', bob.id);
      expect(envelope).not.toBeNull();
      publishedIds.push(envelope!.id);

      // D6/C11: журнал доставок фиксирует канал ws.
      const notifId = (envelope!.envelope.payload as { snapshot: { notificationId: string } })
        .snapshot.notificationId;
      const deliveries = (await (
        await fx.api(bob, 'GET', `/notifications/${notifId}/deliveries`)
      ).json()) as { items: Array<{ channel: string; attempt: number }> };
      expect(deliveries.items.some((d) => d.channel === 'ws' && d.attempt === 0)).toBe(true);
    });

    it('B9/B1: автору — ничего; получателю direct — high', async () => {
      const conversationId = await directId(bob, alice);
      await fx.api(bob, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: 'личное без упоминания' },
        key: `notif-d-${fx.runId}`,
      });
      await runPipeline();

      const bobList = (await (await listNotifications(bob, '?filter=unread')).json()) as {
        items: Array<{ conversationId: string }>;
      };
      expect(bobList.items.some((i) => i.conversationId === conversationId)).toBe(false);

      const aliceList = (await (await listNotifications(alice, '?filter=attention')).json()) as {
        items: Array<{ priority: string; kind: string; conversationId: string }>;
      };
      const direct = aliceList.items.find((i) => i.conversationId === conversationId);
      expect(direct?.priority).toBe('high');
      expect(direct?.kind).toBe('chat.direct_message');
    });

    it('#189: правка сообщения — уведомление участнику (не редактору), низкий приоритет', async () => {
      const conversationId = await directId(bob, alice);
      const message = (await (
        await fx.api(bob, 'POST', `/chat/conversations/${conversationId}/messages`, {
          body: { text: 'исходный текст правки' },
          key: `notif-e-${fx.runId}`,
        })
      ).json()) as { id: string };

      await fx.api(bob, 'PATCH', `/chat/conversations/${conversationId}/messages/${message.id}`, {
        body: { text: 'исправленный текст правки' },
        key: `notif-edit-${fx.runId}`,
      });
      await runPipeline();

      const aliceList = (await (await listNotifications(alice, '?filter=unread')).json()) as {
        items: Array<{
          priority: string;
          kind: string;
          preview: string | null;
          conversationId: string;
        }>;
      };
      const edited = aliceList.items.find(
        (i) => i.conversationId === conversationId && i.kind === 'chat.message_edited',
      );
      expect(edited?.priority).toBe('low');
      expect(edited?.preview).toBe('исправленный текст правки');

      const bobList = (await (await listNotifications(bob, '?filter=unread&limit=100')).json()) as {
        items: Array<{ kind: string; conversationId: string }>;
      };
      expect(
        bobList.items.some(
          (i) => i.conversationId === conversationId && i.kind === 'chat.message_edited',
        ),
      ).toBe(false);
    });

    it('C1/C2/C3: срочное — urgent + повтор воркером + стоп реакцией', async () => {
      const conversationId = await directId(alice, bob);
      const message = (await (
        await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
          body: { text: 'Срочно: выезд на объект сегодня', urgent: true },
          key: `notif-u-${fx.runId}`,
        })
      ).json()) as { id: string };

      await runPipeline();

      const bobList = (await (await listNotifications(bob, '?filter=attention')).json()) as {
        items: Array<{ id: string; priority: string; kind: string; urgentText: string | null }>;
      };
      const urgent = bobList.items.find((i) => i.kind === 'urgent.message');
      expect(urgent?.priority).toBe('urgent');
      expect(urgent?.urgentText).toContain('Срочно');

      // Повтор: воркер проверяет стоп-условия → эмит attempt>=1 + deliveries repeat.
      const outcome = await urgentWorker.remind(urgent!.id);
      expect(outcome).toBe('sent');
      await runPipeline();
      const repeatEnvelope = await findNotificationEnvelope(
        'notification.dispatch_requested',
        bob.id,
        1,
      );
      expect(repeatEnvelope).not.toBeNull();
      publishedIds.push(repeatEnvelope!.id);
      const deliveries = (await (
        await fx.api(bob, 'GET', `/notifications/${urgent!.id}/deliveries`)
      ).json()) as { items: Array<{ channel: string; attempt: number }> };
      expect(deliveries.items.some((d) => d.channel === 'repeat' && d.attempt >= 1)).toBe(true);

      // C3: реакция получателя останавливает повторы (равноценно прочтению).
      await fx.api(
        bob,
        'POST',
        `/chat/conversations/${conversationId}/messages/${message.id}/reactions`,
        {
          body: { emoji: '👍' },
          key: `notif-r-${fx.runId}`,
        },
      );
      await runPipeline();
      const afterReaction = await urgentWorker.remind(urgent!.id);
      expect(afterReaction).toBe('stop');
    });

    it('C5: лимит срочных — четвёртая за сутки отклоняется', async () => {
      const conversationId = await directId(carol, bob);
      for (let i = 0; i < 3; i += 1) {
        const sent = await fx.api(carol, 'POST', `/chat/conversations/${conversationId}/messages`, {
          body: { text: `срочное ${i}`, urgent: true },
          key: `notif-l${i}-${fx.runId}`,
        });
        expect(sent.status).toBe(201);
      }
      const fourth = await fx.api(carol, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: 'срочное 3', urgent: true },
        key: `notif-l3-${fx.runId}`,
      });
      expect(fourth.status).toBe(409);
      expect(((await fourth.json()) as { code: string }).code).toBe('CHAT_URGENT_LIMIT_EXCEEDED');
    });

    it('C8/C9: ознакомление — ack + аналитика «ознакомились N из M»', async () => {
      const conversationId = await directId(alice, bob);
      const message = (await (
        await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
          body: { text: 'Срочно: ознакомьтесь с приказом', urgent: true },
          key: `notif-a-${fx.runId}`,
        })
      ).json()) as { id: string };
      await runPipeline();

      const before = (await (
        await fx.api(alice, 'GET', `/notifications/urgent/${message.id}/acks`)
      ).json()) as { ackedCount: number; expectedCount: number };
      expect(before.expectedCount).toBe(1);
      expect(before.ackedCount).toBe(0);

      const bobList = (await (await listNotifications(bob, '?filter=attention')).json()) as {
        items: Array<{ id: string; kind: string; ackAt: string | null }>;
      };
      const urgent = bobList.items.find((i) => i.kind === 'urgent.message');
      const ack = await fx.api(bob, 'POST', `/notifications/${urgent!.id}/ack`, {
        key: `notif-ack-${fx.runId}`,
      });
      expect(ack.status).toBe(200);
      expect(((await ack.json()) as { ackAt: string }).ackAt).toBeTruthy();

      // D5: повторный ack с тем же Idempotency-Key — replay, один эффект.
      const replay = await fx.api(bob, 'POST', `/notifications/${urgent!.id}/ack`, {
        key: `notif-ack-${fx.runId}`,
      });
      expect(replay.status).toBe(200);

      const after = (await (
        await fx.api(alice, 'GET', `/notifications/urgent/${message.id}/acks`)
      ).json()) as {
        ackedCount: number;
        expectedCount: number;
        items: Array<{ user: { id: string } }>;
      };
      expect(after.ackedCount).toBe(1);
      expect(after.items[0]!.user.id).toBe(bob.id);

      // notification.acked уходит отправителю (C9-будило).
      await runPipeline();
      const acked = await findNotificationEnvelope('notification.acked', alice.id);
      expect(acked).not.toBeNull();
      publishedIds.push(acked!.id);
    });

    it('D4: повторная диспетчеризация события не плодит уведомления', async () => {
      // Раскрутить хвост до пустого (фон-тик диспетчера живёт в app — гонка).
      for (let i = 0; i < 3; i += 1) {
        await dispatcher.dispatchPending();
        const pending = await prisma.event.count({ where: { publishedAt: null } });
        if (pending === 0) break;
      }
      const before = await prisma.notification.count({ where: { userId: bob.id } });
      await dispatcher.dispatchPending(); // повтор тех же событий
      await dispatcher.dispatchPending();
      const after = await prisma.notification.count({ where: { userId: bob.id } });
      expect(after).toBe(before);
    });

    it('B3: muted-беседа — высокий приоритет понижен до низкого', async () => {
      const conversationId = await directId(alice, carol);
      await fx.api(carol, 'PATCH', `/chat/conversations/${conversationId}`, {
        body: { muted: true },
      });
      await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: 'привет в замьюченном' },
        key: `notif-mute-${fx.runId}`,
      });
      await runPipeline();
      const carolList = (await (await listNotifications(carol, '?filter=unread')).json()) as {
        items: Array<{ priority: string; conversationId: string }>;
      };
      const hit = carolList.items.find((i) => i.conversationId === conversationId);
      expect(hit?.priority).toBe('low');
    });

    it('негатив: ack чужого уведомления — 404 (G3)', async () => {
      const res = await fx.api(
        carol,
        'POST',
        '/notifications/00000000-0000-4000-8000-00000000dead/ack',
        {
          key: `neg-ack-${fx.runId}`,
        },
      );
      expect(res.status).toBe(404);
    });

    it('негатив: deliveries чужого id — 404', async () => {
      const res = await fx.api(
        carol,
        'GET',
        '/notifications/00000000-0000-4000-8000-00000000dead/deliveries',
      );
      expect(res.status).toBe(404);
    });

    it('негатив: невалидный курсор — VALIDATION_FAILED', async () => {
      const res = await fx.api(bob, 'GET', '/notifications?cursor=abc');
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_FAILED');
    });

    it('негатив: упоминание несуществующего имени — уведомление только низкого приоритета', async () => {
      const res = await fx.api(alice, 'POST', '/chat/conversations', {
        body: { type: 'group', title: `Neg ${fx.runId}`, memberIds: [bob.id] },
      });
      const conversationId = ((await res.json()) as { id: string }).id;
      await fx.api(alice, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: '@НесуществующийПользователь, срочно' },
        key: `neg-mention-${fx.runId}`,
      });
      await runPipeline();
      const bobList = (await (await listNotifications(bob, '?filter=unread')).json()) as {
        items: Array<{ priority: string; kind: string; conversationId: string }>;
      };
      const hit = bobList.items.find((i) => i.conversationId === conversationId);
      expect(hit?.priority).toBe('low');
      expect(hit?.kind).toBe('chat.channel_post');
    });

    it('E3: read-one — открытие обычного гасит строку, журнал хранит', async () => {
      const conversationId = await directId(bob, alice);
      await fx.api(bob, 'POST', `/chat/conversations/${conversationId}/messages`, {
        body: { text: 'прочитай меня открытием' },
        key: `ro-${fx.runId}`,
      });
      await runPipeline();
      const list = (await (await listNotifications(alice, '?filter=attention')).json()) as {
        items: Array<{ id: string; conversationId: string; readAt: string | null }>;
      };
      const target = list.items.find((i) => i.conversationId === conversationId);
      expect(target).toBeTruthy();
      const read = await fx.api(alice, 'POST', `/notifications/${target!.id}/read`, {
        key: `ro-ack-${fx.runId}`,
      });
      expect(read.status).toBe(200);
      expect(((await read.json()) as { readAt: string }).readAt).toBeTruthy();
      const after = (await (await listNotifications(alice, '?filter=attention')).json()) as {
        items: Array<{ id: string }>;
      };
      expect(after.items.some((i) => i.id === target!.id)).toBe(false);
      const all = (await (await listNotifications(alice, '?filter=all&limit=100')).json()) as {
        items: Array<{ id: string; readAt: string | null }>;
      };
      expect(all.items.some((i) => i.id === target!.id && i.readAt !== null)).toBe(true);
    });
  },
);
