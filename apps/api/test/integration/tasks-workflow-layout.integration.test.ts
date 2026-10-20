import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

type Detail = {
  version: number;
  document: {
    stages: { id: string }[];
    transitions: unknown[];
    layout?: { stages: Record<string, unknown> };
  };
};

/**
 * Расстановка холста #378 ред. 2 (живое HTTP + БД): PUT .../layout — 403 без
 * права, сохранение без новой версии, отбрасывание несуществующих записей;
 * публикация с устаревшим местом в документе не затирает сохранённое.
 */
describe.skipIf(!process.env.DATABASE_URL)('tasks workflow layout (integration, #378)', () => {
  let fx: ChatTestFixture<'admin' | 'alice'>;
  let admin: ChatUser;
  let alice: ChatUser;
  let customTypeId = '';
  let workflowId = '';
  let stageId = '';

  const detail = async () =>
    (await (await fx.api(admin, 'GET', `/tasks/workflows/${workflowId}`)).json()) as Detail;

  beforeAll(async () => {
    fx = await setupChatFixture(['admin', 'alice']);
    await fx.prisma.featureFlag.upsert({
      where: { key: 'tasks' },
      update: { enabled: true },
      create: { key: 'tasks', enabled: true },
    });
    const tokens = fx.app.get(TokenService);
    const sign = async (u: ChatUser, permissions: string[]) => ({
      ...u,
      token: await tokens.signAccessToken(
        { id: u.id, email: u.email, displayName: u.displayName, permissions },
        'integration-test-session',
      ),
    });
    admin = await sign(fx.users.admin, [Permission.TASK_WORKFLOW_MANAGE]);
    alice = await sign(fx.users.alice, [Permission.TASK_CREATE]);
    const created = await fx.api(admin, 'POST', '/tasks/types', {
      body: {
        name: `IT-расстановка ${fx.runId}`,
        icon: 'zap',
        color: 'info',
        base: { kind: 'simple' },
      },
      key: `it-lay-type-${fx.runId}`,
    });
    const type = (await created.json()) as { id: string; workflowId: string };
    customTypeId = type.id;
    workflowId = type.workflowId;
    stageId = (await detail()).document.stages[0]!.id;
  }, 120_000);

  afterAll(async () => {
    if (fx) {
      await fx.prisma.workflowSchemeEntry.deleteMany({ where: { taskTypeId: customTypeId } });
      await fx.prisma.taskType.deleteMany({ where: { id: customTypeId } });
      await fx.prisma.workflowTransition.deleteMany({ where: { workflowId } });
      await fx.prisma.workflowStage.deleteMany({ where: { workflowId } });
      await fx.prisma.workflow.deleteMany({ where: { id: workflowId } });
      await fx.cleanup();
    }
  });

  it('без права 403; с правом — сохранена без новой версии, new:* отброшено', async () => {
    const path = `/tasks/workflows/${workflowId}/layout`;
    const layout = {
      stages: { [stageId]: { x: 40, y: 80 }, 'new:ghost': { x: 0, y: 0 } },
      transitions: {},
    };
    const denied = await fx.api(alice, 'PUT', path, {
      body: { layout },
      key: `it-lay-d-${fx.runId}`,
    });
    expect(denied.status).toBe(403);
    const saved = await fx.api(admin, 'PUT', path, { body: { layout }, key: `it-lay-${fx.runId}` });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      layout: { stages: { [stageId]: { x: 40, y: 80 } }, transitions: {} },
    });
    const after = await detail();
    expect(after.version).toBe(1);
    expect(after.document.layout?.stages[stageId]).toEqual({ x: 40, y: 80 });
  });

  it('публикация с устаревшим местом в документе не затирает сохранённую расстановку', async () => {
    const base = await detail();
    const published = await fx.api(admin, 'POST', `/tasks/workflows/${workflowId}/publish`, {
      body: {
        baseVersion: base.version,
        document: {
          ...base.document,
          layout: { stages: { [stageId]: { x: 0, y: 0 } }, transitions: {} },
        },
        migrations: [],
      },
      key: `it-lay-pub-${fx.runId}`,
    });
    expect(published.status).toBe(200);
    const after = await detail();
    expect(after.version).toBe(2);
    expect(after.document.layout?.stages[stageId]).toEqual({ x: 40, y: 80 });
  });
});
