import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  ErrorCode,
  Permission,
  taskDetailSchema,
  taskListItemSchema,
  taskBranchSchema,
  taskTransitionSchema,
} from '@nodus/contracts';
import { z } from 'zod';

import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Контракт модуля задач на живом HTTP (#37): создание без проекта
 * (контракт + outbox task.created с audience + «Мой план»), идемпотентность
 * Idempotency-Key, видимость (чужой = 404), гейт DoD подзадач (409 с
 * причинами), переход маршрута с автоперемещением личной доски.
 */
describe.skipIf(!process.env.DATABASE_URL)('tasks (integration)', () => {
  let fx: ChatTestFixture<'alice' | 'bob' | 'carol'>;
  let alice: ChatUser;
  let bob: ChatUser;
  let carol: ChatUser;
  const taskIds: string[] = [];

  beforeAll(async () => {
    fx = await setupChatFixture(['alice', 'bob', 'carol']);
    await fx.prisma.featureFlag.upsert({
      where: { key: 'tasks' },
      update: { enabled: true },
      create: { key: 'tasks', enabled: true },
    });
    const tokens = fx.app.get(TokenService);
    const withCreate = async (u: ChatUser): Promise<ChatUser> => ({
      ...u,
      token: await tokens.signAccessToken(
        {
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          permissions: [Permission.TASK_CREATE],
        },
        'integration-test-session',
      ),
    });
    alice = await withCreate(fx.users.alice);
    bob = await withCreate(fx.users.bob);
    carol = await withCreate(fx.users.carol);
  }, 120_000);

  afterAll(async () => {
    if (fx && taskIds.length > 0) {
      await fx.prisma.task.updateMany({
        where: { parentId: { in: taskIds } },
        data: { parentId: null },
      });
      await fx.prisma.task.deleteMany({ where: { id: { in: taskIds } } });
      await fx.prisma.workflow.deleteMany({
        where: { kind: 'personal', ownerId: { in: [alice.id, bob.id, carol.id] } },
      });
    }
    await fx?.cleanup();
  });

  it('создание без проекта и колонки: контракт, outbox с audience, «Мой план»', async () => {
    const key = `it-task-${fx.runId}`;
    const body = { title: `Принести справку ${fx.runId}`, assigneeId: bob.id };
    const res = await fx.api(alice, 'POST', '/tasks', { body, key });
    expect(res.status).toBe(201);
    const task = taskListItemSchema.parse(await res.json());
    taskIds.push(task.id);
    expect(task.project).toBeNull();
    expect(task.type.code).toBe('task');
    expect(task.stage.systemState).toBe('backlog');

    const replay = await fx.api(alice, 'POST', '/tasks', { body, key });
    expect(taskListItemSchema.parse(await replay.json()).id).toBe(task.id);

    const event = await fx.prisma.event.findFirst({
      where: { type: 'task.created', aggregateId: task.id },
    });
    expect((event?.payload as { audience: string[] }).audience.sort()).toEqual(
      [alice.id, bob.id].sort(),
    );
    const placements = await fx.prisma.taskPersonalPlacement.findMany({
      where: { taskId: task.id },
    });
    expect(placements.map((p) => p.userId).sort()).toEqual([alice.id, bob.id].sort());
  });

  it('видимость: не участник получает 404', async () => {
    const res = await fx.api(carol, 'GET', `/tasks/${taskIds[0]}`);
    expect(res.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await res.json()).code).toBe(ErrorCode.NOT_FOUND);
  });

  it('гейт «нет открытых подзадач» и переход с автоперемещением', async () => {
    const parentId = taskIds[0]!;
    const sub = await fx.api(alice, 'POST', `/tasks/${parentId}/subtasks`, {
      body: { title: `Подзадача ${fx.runId}`, assigneeId: bob.id },
      key: `it-sub-${fx.runId}`,
    });
    expect(sub.status).toBe(201);
    taskIds.push(taskListItemSchema.parse(await sub.json()).id);

    const list = z
      .array(taskTransitionSchema)
      .parse(await (await fx.api(bob, 'GET', `/tasks/${parentId}/transitions`)).json());
    const start = list.find((t) => t.name === 'Начать')!;
    const started = await fx.api(bob, 'POST', `/tasks/${parentId}/transitions/${start.id}`, {
      body: {},
      key: `it-start-${fx.runId}`,
    });
    expect(taskListItemSchema.parse(await started.json()).stage.systemState).toBe('active');
    const bobPlacement = await fx.prisma.taskPersonalPlacement.findUniqueOrThrow({
      where: { taskId_userId: { taskId: parentId, userId: bob.id } },
      include: { stage: true },
    });
    expect(bobPlacement.stage.systemState).toBe('active');

    const after = z
      .array(taskTransitionSchema)
      .parse(await (await fx.api(bob, 'GET', `/tasks/${parentId}/transitions`)).json());
    const complete = after.find((t) => t.name === 'Завершить')!;
    expect(complete.blockedBy).toEqual([{ kind: 'no_open_subtasks', count: 1 }]);
    const blocked = await fx.api(bob, 'POST', `/tasks/${parentId}/transitions/${complete.id}`, {
      body: {},
      key: `it-done-${fx.runId}`,
    });
    expect(blocked.status).toBe(409);
    const error = apiErrorResponseSchema.parse(await blocked.json());
    expect(error.code).toBe(ErrorCode.TASK_TRANSITION_BLOCKED);

    const detail = taskDetailSchema.parse(
      await (await fx.api(bob, 'GET', `/tasks/${parentId}`)).json(),
    );
    expect(detail.subtasks).toHaveLength(1);
    expect(detail.access.canDelete).toBe(false);
  });
  it('ветка: невидимый зрителю узел — только номер, без названия и стадии (#343)', async () => {
    const parentId = taskIds[0]!;
    const res = await fx.api(alice, 'POST', `/tasks/${parentId}/subtasks`, {
      body: { title: `Чужая подзадача ${fx.runId}`, assigneeId: carol.id },
      key: `it-sub-hidden-${fx.runId}`,
    });
    expect(res.status).toBe(201);
    const hiddenId = taskListItemSchema.parse(await res.json()).id;
    taskIds.push(hiddenId);

    const branch = taskBranchSchema.parse(
      await (await fx.api(bob, 'GET', `/tasks/${parentId}/branch`)).json(),
    );
    expect(branch.root).toMatchObject({ id: parentId, hidden: false });
    expect(branch.root.stageName).not.toBeNull();
    const node = branch.root.children.find((c) => c.id === hiddenId);
    expect(node).toMatchObject({
      hidden: true,
      title: `ПП-${node?.number}`,
      stageName: null,
      stageColor: null,
      systemState: null,
    });
  });
});
