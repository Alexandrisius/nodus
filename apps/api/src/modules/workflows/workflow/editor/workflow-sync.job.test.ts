import { describe, expect, it, vi } from 'vitest';

import { WorkflowSyncJob } from './workflow-sync.job.js';

/** Юнит-сценарии задания переноса (#378, ADR-0024): задание не трогает
 *  таблицы сущностей — оно выбирает адаптер категории и отдаёт ему перенос
 *  и пересчёт группы. Идемпотентность и пачки — внутри адаптера. */

const FROM = '00000000-0000-4000-8000-0000000000a1';
const TO = '00000000-0000-4000-8000-0000000000a2';
const STAGE = '00000000-0000-4000-8000-0000000000a3';

function makeJob() {
  const adapter = {
    migrateStage: vi.fn(async () => 3),
    restateStage: vi.fn(async () => 2),
  };
  const workflows = {
    findStageById: vi.fn(async () => ({
      id: TO,
      name: 'В работе',
      systemState: 'active',
      outcome: null,
      archivedAt: null,
    })),
  };
  const registry = { get: vi.fn(() => adapter) };
  const job = new WorkflowSyncJob(
    workflows as never,
    registry as never,
    { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
  );
  return { job, adapter, registry, workflows };
}

const DATA = {
  workflowId: '00000000-0000-4000-8000-0000000000f1',
  version: 2,
  category: 'task' as const,
};

describe('WorkflowSyncJob (#378, ADR-0024)', () => {
  it('перенос: цель из маршрута → адаптер категории', async () => {
    const made = makeJob();
    const touched = await made.job.run({
      ...DATA,
      moves: [{ fromStageId: FROM, toStageId: TO }],
      restates: [],
    });
    expect(touched).toBe(3);
    expect(made.registry.get).toHaveBeenCalledWith('task');
    expect(made.adapter.migrateStage).toHaveBeenCalledWith(
      FROM,
      expect.objectContaining({ id: TO, systemState: 'active' }),
    );
  });

  it('смена группы статуса: пересчёт отдаётся адаптеру', async () => {
    const made = makeJob();
    const touched = await made.job.run({
      ...DATA,
      moves: [],
      restates: [{ stageId: STAGE, systemState: 'active' }],
    });
    expect(touched).toBe(2);
    expect(made.adapter.restateStage).toHaveBeenCalledWith(STAGE, 'active');
  });

  it('цель переноса исчезла — перенос пропускается, задание не падает', async () => {
    const made = makeJob();
    made.workflows.findStageById.mockResolvedValueOnce(null as never);
    const touched = await made.job.run({
      ...DATA,
      moves: [{ fromStageId: FROM, toStageId: TO }],
      restates: [],
    });
    expect(touched).toBe(0);
    expect(made.adapter.migrateStage).not.toHaveBeenCalled();
  });
});
