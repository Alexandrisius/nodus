import { describe, expect, it, vi } from 'vitest';

import { WorkflowSyncJob } from './workflow-sync.job.js';

/** Юнит-сценарии задания переноса (#378, спека «Тесты»): идемпотентность
 *  (повторный прогон ничего не находит), перемещение через StageMover,
 *  смена группы — StageMover.restate (состояние + «Мой план»), личные
 *  маршруты держателей готовятся до транзакции. БД мокается. */

const FROM = '00000000-0000-4000-8000-0000000000a1';
const TO = '00000000-0000-4000-8000-0000000000a2';
const STAGE = '00000000-0000-4000-8000-0000000000a3';
const TASK = '00000000-0000-4000-8000-0000000000b1';

const task = {
  id: TASK,
  number: 7,
  stageId: FROM,
  systemState: 'paused',
  creatorId: 'u1',
  assigneeId: 'u2',
  completedAt: null,
  participants: [{ userId: 'u3', role: 'coexecutor' }],
};

function makeJob() {
  const mover = { apply: vi.fn(async () => void 0), restate: vi.fn(async () => void 0) };
  const workflows = {
    taskIdsOfStage: vi.fn(),
    taskIdsToRestate: vi.fn(),
    findStageById: vi.fn(async () => ({
      id: TO,
      name: 'В работе',
      systemState: 'active',
      outcome: null,
      archivedAt: null,
    })),
  };
  const tasksRepo = {
    lock: vi.fn(async () => void 0),
    findWithParticipants: vi.fn(async () => task),
    findLiveRoster: vi.fn(async () => task),
  };
  const placements = { prepare: vi.fn(async () => void 0) };
  const job = new WorkflowSyncJob(
    { run: vi.fn(async (fn: (t: unknown) => unknown) => fn({})) } as never,
    tasksRepo as never,
    workflows as never,
    placements as never,
    mover as never,
    { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
  );
  return { job, mover, workflows, placements };
}

const DATA = { workflowId: '00000000-0000-4000-8000-0000000000f1', version: 2 };

describe('WorkflowSyncJob (#378)', () => {
  it('перенос: пачка задач → StageMover cause=workflow_migration; повтор — пусто', async () => {
    const made = makeJob();
    made.workflows.taskIdsOfStage.mockResolvedValueOnce([{ id: TASK }]).mockResolvedValue([]);
    const data = { ...DATA, moves: [{ fromStageId: FROM, toStageId: TO }], restates: [] };
    await expect(made.job.run(data)).resolves.toBe(1);
    expect(made.mover.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: TASK }),
      expect.objectContaining({ id: TO }),
      null,
      { transitionId: null, cause: 'workflow_migration' },
    );
    // Личные маршруты держателей — до транзакции (постановщик, исполнитель, соисполнитель).
    expect(made.placements.prepare).toHaveBeenCalledWith(['u1', 'u2', 'u3']);
    // Идемпотентность: повторный прогон ничего не находит.
    await expect(made.job.run(data)).resolves.toBe(0);
  });

  it('смена группы статуса: StageMover.restate каждой задаче («Мой план» переезжает)', async () => {
    const made = makeJob();
    made.workflows.taskIdsToRestate.mockResolvedValueOnce([{ id: TASK }]).mockResolvedValue([]);
    const touched = await made.job.run({
      ...DATA,
      moves: [],
      restates: [{ stageId: STAGE, systemState: 'active' }],
    });
    expect(touched).toBe(1);
    expect(made.mover.restate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: TASK }),
      'active',
    );
  });
});
