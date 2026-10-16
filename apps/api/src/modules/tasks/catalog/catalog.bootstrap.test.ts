import { describe, expect, it, vi } from 'vitest';

import { CatalogBootstrap, stageDrift } from './catalog.bootstrap.js';
import { DEFAULT_TASK_WORKFLOW, PERSONAL_TEMPLATE } from './system-catalog.js';

const TX = { tx: true };

type StageOverride = Partial<{ systemState: string; sortOrder: number }>;

/** БД, где системные стадии уже есть: копия каталога с правками overrides. */
function setup(overrides: Record<string, StageOverride> = {}) {
  const stageRow = (workflowId: string, code: string) => {
    const def = workflowId === 'wf-task' ? DEFAULT_TASK_WORKFLOW : PERSONAL_TEMPLATE;
    const index = def.stages.findIndex((s) => s.code === code);
    const s = def.stages[index]!;
    return {
      id: `${workflowId}:${code}`,
      name: s.name,
      color: s.color,
      sortOrder: index,
      systemState: s.systemState,
      isInitial: s.isInitial ?? false,
      ...(workflowId === 'wf-task' ? overrides[code] : {}),
    };
  };
  const repo = {
    ensureType: vi.fn().mockResolvedValue({ id: 'type' }),
    ensureDefaultScheme: vi.fn().mockResolvedValue({ id: 'scheme' }),
    ensureSchemeEntry: vi.fn(),
    ensureWorkflow: vi.fn().mockImplementation((_tx: unknown, def: { code: string }) =>
      Promise.resolve({
        id: def.code === DEFAULT_TASK_WORKFLOW.code ? 'wf-task' : 'wf-personal',
      }),
    ),
    findStage: vi
      .fn()
      .mockImplementation((_tx: unknown, wf: string, code: string) =>
        Promise.resolve(stageRow(wf, code)),
      ),
    createStage: vi.fn(),
    updateStage: vi.fn(),
    restateStageTasks: vi.fn().mockResolvedValue(3),
    findTransition: vi.fn().mockResolvedValue({ id: 'tr' }),
    updateTransition: vi.fn(),
    createTransition: vi.fn(),
  };
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const bootstrap = new CatalogBootstrap(
    { run: (fn: (tx: unknown) => unknown) => fn(TX) } as never,
    repo as never,
    logger as never,
  );
  return { bootstrap, repo };
}

describe('CatalogBootstrap — синхронизация системного каталога', () => {
  it('каталог совпадает с БД — стадии не переписываются, задачи не трогаются', async () => {
    const { bootstrap, repo } = setup();
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.restateStageTasks).not.toHaveBeenCalled();
    expect(repo.createStage).not.toHaveBeenCalled();
  });

  it('сменились systemState и порядок стадии — правка + пересчёт задач в той же tx', async () => {
    const { bootstrap, repo } = setup({ on_control: { systemState: 'active', sortOrder: 9 } });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledTimes(1);
    expect(repo.updateStage).toHaveBeenCalledWith(TX, 'wf-task:on_control', {
      systemState: 'done',
      sortOrder: 2,
    });
    expect(repo.restateStageTasks).toHaveBeenCalledWith(
      TX,
      'wf-task:on_control',
      'done',
      expect.any(Date),
    );
  });

  it('сменился только порядок — без пересчёта задач', async () => {
    const { bootstrap, repo } = setup({ new: { sortOrder: 4 } });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(TX, 'wf-task:new', { sortOrder: 0 });
    expect(repo.restateStageTasks).not.toHaveBeenCalled();
  });

  it('переходы синхронизируют from/to (null = «из любой»), правила и порядок', async () => {
    const { bootstrap, repo } = setup();
    await bootstrap.ensure();
    const cancel = DEFAULT_TASK_WORKFLOW.transitions.findIndex((t) => t.code === 'cancel');
    expect(repo.updateTransition.mock.calls[cancel]![2]).toMatchObject({
      name: 'Отменить',
      fromStageId: null,
      toStageId: 'wf-task:cancelled',
      sortOrder: cancel,
    });
    expect(repo.updateTransition.mock.calls[0]![2]).toMatchObject({
      fromStageId: 'wf-task:new',
      toStageId: 'wf-task:in_progress',
      rules: { conditions: [{ kind: 'role_in', roles: ['assignee', 'coexecutor'] }] },
    });
  });
});

describe('stageDrift', () => {
  const base = { name: 'A', color: 'info', sortOrder: 0, systemState: 'active', isInitial: false };
  it('только разошедшиеся поля; совпадение — null', () => {
    expect(stageDrift(base, base)).toBeNull();
    expect(stageDrift(base, { ...base, isInitial: true, name: 'B' })).toEqual({
      isInitial: true,
      name: 'B',
    });
  });
});
