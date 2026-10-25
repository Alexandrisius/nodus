import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Публикация окна перехода вместе с кнопкой (#380, ADR-0021): форма в GET,
 * неизвестный вид раздела — 400. Живое HTTP + БД.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'workflows: окно перехода в документе (integration, #380)',
  () => {
    let fx: ChatTestFixture<'admin'>;
    let admin: ChatUser;
    let workflowId = '';

    beforeAll(async () => {
      fx = await setupChatFixture(['admin']);
      const tokens = fx.app.get(TokenService);
      admin = {
        ...fx.users.admin,
        token: await tokens.signAccessToken(
          {
            id: fx.users.admin.id,
            email: fx.users.admin.email,
            displayName: fx.users.admin.displayName,
            permissions: [Permission.WORKFLOW_MANAGE, Permission.TASK_MANAGE_ANY],
          },
          'integration-test-session',
        ),
      };
      const types = (await (
        await fx.api(admin, 'GET', '/workflows/types?archived=include')
      ).json()) as { code: string; workflowId: string }[];
      workflowId = types.find((t) => t.code === 'task')!.workflowId;
    }, 120_000);

    afterAll(async () => {
      await fx?.cleanup();
    });

    it('окно перехода публикуется вместе с кнопкой: форма в GET, неизвестный вид — 400', async () => {
      const detail = (await (await fx.api(admin, 'GET', `/workflows/${workflowId}`)).json()) as {
        version: number;
        document: {
          stages: unknown[];
          transitions: { id: string; form?: unknown }[];
          layout?: unknown;
        };
      };
      const form = {
        enabled: true,
        sections: [
          { kind: 'comment', label: 'Причина возврата', required: true },
          { kind: 'result_files', label: 'Акт' },
        ],
      };
      const document = {
        ...detail.document,
        transitions: detail.document.transitions.map((t) =>
          (t as { name?: string }).name === 'Завершить' ? { ...t, form } : t,
        ),
      };
      const published = await fx.api(admin, 'POST', `/workflows/${workflowId}/publish`, {
        body: { baseVersion: detail.version, document, migrations: [] },
        key: `it-form-${fx.runId}`,
      });
      expect(published.status).toBe(200);
      const fresh = (await (await fx.api(admin, 'GET', `/workflows/${workflowId}`)).json()) as {
        document: { transitions: { name: string; form?: unknown }[] };
      };
      expect(fresh.document.transitions.find((t) => t.name === 'Завершить')?.form).toMatchObject(
        form,
      );

      const invalid = await fx.api(admin, 'POST', `/workflows/${workflowId}/publish`, {
        body: {
          baseVersion: ((await published.json()) as { version: number }).version,
          document: {
            ...document,
            transitions: document.transitions.map((t) =>
              (t as { name?: string }).name === 'Завершить'
                ? { ...t, form: { enabled: true, sections: [{ kind: 'questions' }] } }
                : t,
            ),
          },
          migrations: [],
        },
        key: `it-form-invalid-${fx.runId}`,
      });
      expect(invalid.status).toBe(400);
    });
  },
);
