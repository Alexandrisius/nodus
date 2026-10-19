import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import type { PublishWorkflowBody, WorkflowDocument } from '@nodus/contracts';
import { parseRules } from '../transition-rules.js';
import { WorkflowEditorService } from './publish.service.js';
import type { LoadedWorkflow } from '../workflow.repository.js';

/** Юнит-сценарии публикации (#378, спека «Тесты»): конфликт версии,
 *  невалидный документ, обязательный перенос, разрешение new:* (в т.ч.
 *  цели route_if), архив вместо удаления, kind-гвард. БД мокается. */

const WID = '00000000-0000-4000-8000-0000000000f1';
const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';
const S3 = '00000000-0000-4000-8000-000000000003';
const T1 = '00000000-0000-4000-8000-000000000011';
const T2 = '00000000-0000-4000-8000-000000000012';
const CREATED = '00000000-0000-4000-8000-0000000000dd';
const USER = { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [] } as never;

const rules = (extra: Record<string, unknown> = {}) =>
  parseRules({
    conditions: [{ kind: 'role_in', roles: ['assignee'] }],
    validators: [],
    postFunctions: [],
    ...extra,
  });

const loaded: LoadedWorkflow = {
  id: WID,
  stages: [
    {
      id: S1,
      code: 'new',
      name: 'Ожидает',
      systemState: 'backlog',
      archivedAt: null,
      workflowId: WID,
      color: 'neutral',
      sortOrder: 0,
      isInitial: true,
      outcome: null,
    },
    {
      id: S2,
      code: 'in_progress',
      name: 'В работе',
      systemState: 'active',
      archivedAt: null,
      workflowId: WID,
      color: 'success',
      sortOrder: 1,
      isInitial: false,
      outcome: null,
    },
    {
      id: S3,
      code: 'old',
      name: 'Старая',
      systemState: 'paused',
      archivedAt: null,
      workflowId: WID,
      color: 'neutral',
      sortOrder: 2,
      isInitial: false,
      outcome: null,
    },
  ],
  transitions: [
    {
      id: T1,
      name: 'Взять в работу',
      fromStageId: S1,
      toStageId: S2,
      display: 'primary',
      sortOrder: 0,
      rules: rules(),
    },
    {
      id: T2,
      name: 'В архив',
      fromStageId: S2,
      toStageId: S3,
      display: 'button',
      sortOrder: 1,
      rules: rules(),
    },
  ],
};

/** Валидный документ (по схеме каталога «Завершить» с route_if): S1
 *  остаётся, S2/S3-путь меняется: new:ctrl (Утверждение) + new:done (Итог);
 *  S3 архивируется с задачами → нужен перенос. route_if цель (new:done)
 *  отличается от цели кнопки (new:ctrl) — иначе route_if_invalid. */
function document(): WorkflowDocument {
  return {
    stages: [
      {
        id: S1,
        code: 'new',
        name: 'Ожидает',
        color: 'neutral',
        systemState: 'backlog',
        outcome: null,
        isInitial: true,
        sortOrder: 0,
      },
      {
        id: 'new:ctrl',
        code: null,
        name: 'На утверждении',
        color: 'warning',
        systemState: 'done',
        outcome: null,
        isInitial: false,
        sortOrder: 1,
      },
      {
        id: 'new:done',
        code: null,
        name: 'Завершена',
        color: 'info',
        systemState: 'closed',
        outcome: 'success',
        isInitial: false,
        sortOrder: 2,
      },
    ],
    transitions: [
      {
        id: T1,
        code: null,
        name: 'Завершить',
        fromStageId: S1,
        toStageId: 'new:ctrl',
        display: 'primary',
        sortOrder: 0,
        rules: rules({
          postFunctions: [{ kind: 'route_if', when: 'creator_is_assignee', toStageId: 'new:done' }],
        }),
      },
      {
        id: 'new:approve',
        code: null,
        name: 'Утвердить',
        fromStageId: 'new:ctrl',
        toStageId: 'new:done',
        display: 'primary',
        sortOrder: 1,
        rules: parseRules({ conditions: [{ kind: 'role_in', roles: ['creator'] }] }),
      },
    ],
  };
}

function body(overrides: Partial<PublishWorkflowBody>): PublishWorkflowBody {
  return {
    baseVersion: 1,
    document: overrides.document ?? document(),
    migrations: overrides.migrations ?? [],
  };
}

function makeService(
  opts: { version?: number; kind?: string; taskCounts?: Record<string, number> } = {},
) {
  const { version = 1, kind = 'task', taskCounts = { [S3]: 2 } } = opts;
  const calls = {
    stageCreate: vi.fn(async () => ({ id: CREATED })),
    stageUpdate: vi.fn(async () => ({})),
    transitionCreate: vi.fn(async () => ({})),
    transitionUpdate: vi.fn(async () => ({})),
    workflowUpdate: vi.fn(async () => ({ version: version + 1 })),
    emit: vi.fn(async () => void 0),
    afterCommit: vi.fn(async () => void 0),
  };
  const tx = {
    workflowStage: { create: calls.stageCreate, update: calls.stageUpdate },
    workflowTransition: { create: calls.transitionCreate, update: calls.transitionUpdate },
    workflow: { update: calls.workflowUpdate },
    workflowSchemeEntry: { findMany: vi.fn(async () => [{ taskTypeId: 'type-1' }]) },
  };
  const workflows = {
    lockForUpdate: vi.fn(async () => void 0),
    findMeta: vi.fn(async () => ({ kind, version, publishedAt: new Date(), publishedById: null })),
    load: vi.fn(async () => loaded),
    stageTaskCounts: vi.fn(async () => taskCounts),
    typeIdsOf: vi.fn(async () => ['type-1']),
  };
  const service = new WorkflowEditorService(
    { run: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) } as never,
    workflows as never,
    { emit: calls.emit } as never,
    { findRefs: vi.fn(async () => []) } as never,
  );
  return { service, calls };
}

describe('WorkflowEditorService.publish (#378)', () => {
  it('конфликт версии — WORKFLOW_VERSION_CONFLICT', async () => {
    const { service } = makeService({ version: 3 });
    await expect(service.publish(USER, WID, body({}), undefined)).rejects.toMatchObject({
      code: ErrorCode.WORKFLOW_VERSION_CONFLICT,
    });
  });

  it('личный маршрут (kind=personal) — 404 даже с правом', async () => {
    const { service } = makeService({ kind: 'personal' });
    await expect(service.publish(USER, WID, body({}), undefined)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('невалидный документ (пустое имя) — WORKFLOW_INVALID', async () => {
    const { service } = makeService();
    const doc = document();
    doc.stages[0]!.name = '   ';
    await expect(
      service.publish(USER, WID, body({ document: doc }), undefined),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_INVALID });
  });

  it('архив стадии с задачами без переноса — WORKFLOW_MIGRATION_REQUIRED', async () => {
    const { service } = makeService();
    await expect(service.publish(USER, WID, body({}), undefined)).rejects.toMatchObject({
      code: ErrorCode.WORKFLOW_MIGRATION_REQUIRED,
      details: { stages: [{ stageId: S3, count: 2 }] },
    });
  });

  it('успех: new:* → uuid (стадия, кнопка и цель route_if), архив вместо удаления, событие', async () => {
    const { service, calls } = makeService();
    const outcome = await service.publish(
      USER,
      WID,
      body({ migrations: [{ fromStageId: S3, toStageId: S1 }] }),
      calls.afterCommit,
    );
    expect(outcome).toMatchObject({ version: 2, scheduledMoves: 2 });
    // Новая стадия создана с кодом null.
    expect(calls.stageCreate).toHaveBeenCalledTimes(2);
    expect(calls.stageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: null }) }),
    );
    // Новая кнопка «Утвердить» — в созданную стадию (to = uuid).
    const createCall = (calls.transitionCreate.mock.calls as unknown as [unknown[]])[0]![0] as {
      data: { toStageId: string };
    };
    expect(createCall.data.toStageId).toBe(CREATED);
    // Существующая «Завершить» обновлена: цель new:ctrl и route_if-цель
    // new:done — обе резолвнуты в созданный uuid (security: схема = исполняемая).
    const updateCall = (calls.transitionUpdate.mock.calls as unknown as [unknown[]])[0]![0] as {
      data: { toStageId: string; rules: { postFunctions: { toStageId: string }[] } };
    };
    expect(updateCall.data.toStageId).toBe(CREATED);
    expect(updateCall.data.rules.postFunctions[0]!.toStageId).toBe(CREATED);
    // Архив вместо удаления: stageUpdate с archivedAt для S3.
    const archiveCall = (calls.stageUpdate.mock.calls as unknown as [unknown[]]).at(-1)![0] as {
      where: { id: string };
      data: { archivedAt?: Date };
    };
    expect(archiveCall.where.id).toBe(S3);
    expect(archiveCall.data.archivedAt).toBeInstanceOf(Date);
    // Событие публикации и afterCommit с переносами.
    expect(calls.emit).toHaveBeenCalledWith(
      expect.anything(),
      'task.workflow_published',
      expect.objectContaining({ workflowId: WID, version: 2, moves: 1 }),
      expect.anything(),
    );
    expect(calls.afterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        moves: [{ fromStageId: S3, toStageId: S1 }],
      }),
    );
  });
});
