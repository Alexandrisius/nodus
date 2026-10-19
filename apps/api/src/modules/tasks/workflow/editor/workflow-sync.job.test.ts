import { describe, expect, it, vi } from 'vitest';

import { WorkflowSyncJob } from './workflow-sync.job.js';

/** Юнит-сценарии задания переноса (#378, спека «Тесты»): идемпотентность
 *  (повторный прогон ничего не находит), перемещение через StageMover,
 *  смена этапа — денормализация + task.status_changed. БД мокается. */

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
  participants: [],
};

function makeJob() {
  const mover = { apply: vi.fn(async () => void 0) };
  const emit = vi.fn(async () => void 0);
  const findStageById = vi.fn(async () => ({
    id: TO,
    name: 'В работе',
    systemState: 'active',
    outcome: null,
    archivedAt: null,
  }));
  const workflows = {
    taskIdsOfStage: vi.fn(),
    taskIdsToRestate: vi.fn(),
    findStageById,
  };
  const tasksRepo = {
    lock: vi.fn(async () => void 0),
    findWithParticipants: vi.fn(async () => task),
  };
  const taskUpdate = vi.fn(async () => ({}));
  const tx = {
    workflowStage: { findUnique: findStageById },
    task: { update: taskUpdate },
  };
  const job = new WorkflowSyncJob(
    { run: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) } as never,
    { emit } as never,
    tasksRepo as never,
    workflows as never,
    mover as never,
    { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
  );
  return { job, mover, emit, workflows, taskUpdate };
}

describe('WorkflowSyncJob (#378)', () => {
  it('перенос: пачка задач → StageMover reason=workflow_migration; повтор — пусто', async () => {
    const made = makeJob();
    made.workflows.taskIdsOfStage.mockResolvedValueOnce([{ id: TASK }]).mockResolvedValue([]);
    const data = {
      workflowId: '00000000-0000-4000-8000-0000000000f1',
      version: 2,
      moves: [{ fromStageId: FROM, toStageId: TO }],
      restates: [],
    };
    await expect(made.job.run(data)).resolves.toBe(1);
    expect(made.mover.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: TASK }),
      expect.objectContaining({ id: TO }),
      null,
      { transitionId: null, reason: 'workflow_migration' },
    );
    // Идемпотентность: повторный прогон ничего не находит.
    await expect(made.job.run(data)).resolves.toBe(0);
  });

  it('смена этапа: денормализация + task.status_changed каждой задаче', async () => {
    const made = makeJob();
    made.workflows.taskIdsToRestate.mockResolvedValueOnce([{ id: TASK }]).mockResolvedValue([]);
    const touched = await made.job.run({
      workflowId: '00000000-0000-4000-8000-0000000000f1',
      version: 2,
      moves: [],
      restates: [{ stageId: STAGE, systemState: 'active' }],
    });
    expect(touched).toBe(1);
    expect(made.taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TASK },
        data: expect.objectContaining({ systemState: 'active' }),
      }),
    );
    expect(made.emit).toHaveBeenCalledWith(
      expect.anything(),
      'task.status_changed',
      expect.objectContaining({ taskId: TASK, fromState: 'paused', toState: 'active' }),
      expect.anything(),
    );
  });
});
