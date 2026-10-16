import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conversationListItemSchema,
  paginatedSchema,
  Permission,
  taskListItemSchema,
} from '@nodus/contracts';

import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Чат задачи = беседа мессенджера (#252): find-or-create по задаче
 * (идемпотентно), состав = участники задачи (наблюдатель без звука, пишет),
 * не участник — 404, снятие участника убирает его из беседы, вкладки
 * мессенджера фильтруются сервером (scope).
 */
describe.skipIf(!process.env.DATABASE_URL)('task chat (integration)', () => {
  let fx: ChatTestFixture<'alice' | 'bob' | 'carol' | 'dave'>;
  let alice: ChatUser;
  let bob: ChatUser;
  let carol: ChatUser;
  let dave: ChatUser;
  let taskId = '';
  let conversationId = '';

  const members = async () =>
    (
      await fx.prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true, role: true, muted: true },
      })
    ).sort((a, b) => a.userId.localeCompare(b.userId));

  beforeAll(async () => {
    fx = await setupChatFixture(['alice', 'bob', 'carol', 'dave']);
    await fx.prisma.featureFlag.upsert({
      where: { key: 'tasks' },
      update: { enabled: true },
      create: { key: 'tasks', enabled: true },
    });
    const tokens = fx.app.get(TokenService);
    alice = {
      ...fx.users.alice,
      token: await tokens.signAccessToken(
        {
          id: fx.users.alice.id,
          email: fx.users.alice.email,
          displayName: fx.users.alice.displayName,
          permissions: [Permission.TASK_CREATE],
        },
        'integration-test-session',
      ),
    };
    ({ bob, carol, dave } = fx.users);
    const res = await fx.api(alice, 'POST', '/tasks', {
      body: {
        title: `Чат задачи ${fx.runId}`,
        assigneeId: bob.id,
        observerIds: [carol.id],
      },
      key: `it-task-chat-${fx.runId}`,
    });
    expect(res.status).toBe(201);
    taskId = taskListItemSchema.parse(await res.json()).id;
  }, 120_000);

  afterAll(async () => {
    if (fx && taskId) {
      await fx.prisma.task.deleteMany({ where: { id: taskId } });
      await fx.prisma.workflow.deleteMany({
        where: { kind: 'personal', ownerId: { in: [alice.id, bob.id, carol.id] } },
      });
    }
    await fx?.cleanup();
  });

  it('by-task: беседа type=task, состав из участников, повтор — та же беседа', async () => {
    const res = await fx.api(bob, 'GET', `/chat/conversations/by-task/${taskId}`);
    expect(res.status).toBe(200);
    const item = conversationListItemSchema.parse(await res.json());
    conversationId = item.id;
    expect(item.type).toBe('task');
    expect(item.task?.id).toBe(taskId);

    const again = conversationListItemSchema.parse(
      await (await fx.api(alice, 'GET', `/chat/conversations/by-task/${taskId}`)).json(),
    );
    expect(again.id).toBe(conversationId);
    expect(await fx.prisma.conversation.count({ where: { taskId } })).toBe(1);

    const rows = await members();
    expect(rows.map((m) => m.userId).sort()).toEqual([alice.id, bob.id, carol.id].sort());
    expect(rows.find((m) => m.userId === alice.id)?.role).toBe('owner');
    expect(rows.find((m) => m.userId === carol.id)?.muted).toBe(true);
    expect(rows.find((m) => m.userId === bob.id)?.muted).toBe(false);
  });

  it('не участник задачи — 404 без различия', async () => {
    const res = await fx.api(dave, 'GET', `/chat/conversations/by-task/${taskId}`);
    expect(res.status).toBe(404);
  });

  it('наблюдатель пишет в чат задачи', async () => {
    const res = await fx.api(carol, 'POST', `/chat/conversations/${conversationId}/messages`, {
      body: { text: 'вопрос наблюдателя' },
    });
    expect(res.status).toBe(201);
  });

  it('вкладки: entities — чат задачи есть, chats — нет', async () => {
    const page = (scope: string) =>
      fx
        .api(bob, 'GET', `/chat/conversations?scope=${scope}&limit=100`)
        .then(async (r) => paginatedSchema(conversationListItemSchema).parse(await r.json()));
    expect((await page('entities')).items.some((c) => c.id === conversationId)).toBe(true);
    expect((await page('chats')).items.some((c) => c.id === conversationId)).toBe(false);
  });

  it('снятие наблюдателя убирает его из беседы', async () => {
    const res = await fx.api(alice, 'DELETE', `/tasks/${taskId}/participants/${carol.id}`, {
      key: `it-task-chat-rm-${fx.runId}`,
    });
    expect(res.status).toBe(200);
    await fx.api(alice, 'GET', `/chat/conversations/by-task/${taskId}`);
    expect((await members()).map((m) => m.userId)).not.toContain(carol.id);
    const send = await fx.api(carol, 'POST', `/chat/conversations/${conversationId}/messages`, {
      body: { text: 'уже не участник' },
    });
    expect(send.status).toBe(404);
  });
});
