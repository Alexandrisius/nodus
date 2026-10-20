import { describe, expect, it, vi } from 'vitest';
import { TASK_EVENTS } from '@nodus/contracts';

import { CatalogBootstrap, stageDrift } from './catalog.bootstrap.js';
import { CATALOG_REVISION, CATALOG_TASK_TYPES, PERSONAL_TEMPLATE } from './system-catalog.js';

type StageOverride = Partial<{
  systemState: string;
  sortOrder: number;
  name: string;
  outcome: string | null;
}>;

interface DbState {
  /** код маршрута → { customizedAt, catalogRevision }. */
  workflows: Record<string, { customizedAt: Date | null; catalogRevision: number }>;
  /** typeId → customizedAt. */
  typeCustomized: Record<string, Date | null>;
  stageOverrides: Record<string, StageOverride>;
  /** Живые переходы вне каталога (ревизия 1: complete_new, postpone_new). */
  legacyTransitions: { id: string; code: string }[];
  /** Маршруты без стадий в БД (новая установка): id workflow. */
  emptyWorkflows: string[];
}

const STANDARD = CATALOG_TASK_TYPES[0]!.workflow;
const QUICK = CATALOG_TASK_TYPES[1]!.workflow;
const CODE_BY_ID: Record<string, string> = {
  'wf-standard': STANDARD.code,
  'wf-quick': QUICK.code,
  'wf-personal': PERSONAL_TEMPLATE.code,
};

/** id стадий — детерминированные uuid (цели route_if валидируются zod). */
const uuidFor = (code: string): string => {
  const codes = [...STANDARD.stages, ...QUICK.stages, ...PERSONAL_TEMPLATE.stages].map(
    (s) => s.code,
  );
  const index = codes.indexOf(code);
  return `00000000-0000-4000-8000-00000000${String(index).padStart(4, '0')}`;
};

/** Мок БД: по умолчанию текущая ревизия применена везде; validate семантики
 *  «засев один раз». */
function setup(state: Partial<DbState> = {}) {
  const applied = { customizedAt: null, catalogRevision: CATALOG_REVISION };
  const workflows: DbState['workflows'] = {
    [STANDARD.code]: applied,
    [QUICK.code]: applied,
    [PERSONAL_TEMPLATE.code]: applied,
    ...(state.workflows ?? {}),
  };
  const typeCustomized = state.typeCustomized ?? {};
  const stageRow = (workflowId: string, code: string) => {
    const def =
      workflowId === 'wf-standard'
        ? STANDARD
        : workflowId === 'wf-quick'
          ? QUICK
          : PERSONAL_TEMPLATE;
    const index = def.stages.findIndex((s) => s.code === code);
    const s = def.stages[index]!;
    return {
      id: uuidFor(code),
      name: s.name,
      color: s.color,
      sortOrder: index,
      systemState: s.systemState,
      outcome: s.outcome ?? null,
      isInitial: s.isInitial ?? false,
      ...((state.stageOverrides ?? {})[code] ?? {}),
    };
  };
  const created: string[] = [];
  const repo = {
    ensureType: vi
      .fn()
      .mockImplementation((_tx: unknown, def: { code: string }) =>
        Promise.resolve({ id: `type-${def.code}` }),
      ),
    ensureDefaultScheme: vi.fn().mockResolvedValue({ id: 'scheme' }),
    ensureSchemeEntry: vi.fn(),
    lockWorkflow: vi.fn(),
    seedState: vi
      .fn()
      .mockImplementation((_tx: unknown, id: string) =>
        Promise.resolve(workflows[CODE_BY_ID[id]!]!),
      ),
    isTypeCustomized: vi
      .fn()
      .mockImplementation((_tx: unknown, id: string) =>
        Promise.resolve((typeCustomized[id] ?? null) !== null),
      ),
    applyTypeRevision: vi.fn(),
    applyWorkflowRevision: vi.fn().mockResolvedValue(5),
    ensureWorkflow: vi.fn().mockImplementation((_tx: unknown, def: { code: string }) =>
      Promise.resolve({
        id:
          def.code === STANDARD.code
            ? 'wf-standard'
            : def.code === QUICK.code
              ? 'wf-quick'
              : 'wf-personal',
      }),
    ),
    findStage: vi
      .fn()
      .mockImplementation((_tx: unknown, wf: string, code: string) =>
        Promise.resolve((state.emptyWorkflows ?? []).includes(wf) ? null : stageRow(wf, code)),
      ),
    createStage: vi.fn().mockImplementation((_tx: unknown, wf: string) => {
      created.push(wf);
      return Promise.resolve({ id: `created-${created.length}` });
    }),
    updateStage: vi.fn(),
    liveTransitions: vi
      .fn()
      .mockImplementation((_tx: unknown, wf: string) =>
        Promise.resolve(wf === 'wf-standard' ? (state.legacyTransitions ?? []) : []),
      ),
    archiveTransition: vi.fn(),
    findTransition: vi
      .fn()
      .mockImplementation((_tx: unknown, wf: string) =>
        Promise.resolve((state.emptyWorkflows ?? []).includes(wf) ? null : { id: 'tr' }),
      ),
    updateTransition: vi.fn(),
    createTransition: vi.fn(),
  };
  const eventBus = { emit: vi.fn() };
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const TX = { tx: true };
  const bootstrap = new CatalogBootstrap(
    { run: (fn: (tx: unknown) => unknown) => fn(TX) } as never,
    repo as never,
    eventBus as never,
    logger as never,
  );
  return { bootstrap, repo, eventBus, logger, tx: TX as never };
}

const stale = (code: string) => ({
  [code]: { customizedAt: null, catalogRevision: CATALOG_REVISION - 1 },
});

describe('CatalogBootstrap — «засев один раз» (ADR-0021)', () => {
  it('ревизия применена — повторный прогон ничего не меняет', async () => {
    const { bootstrap, repo, eventBus } = setup();
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.createStage).not.toHaveBeenCalled();
    expect(repo.updateTransition).not.toHaveBeenCalled();
    expect(repo.createTransition).not.toHaveBeenCalled();
    expect(repo.archiveTransition).not.toHaveBeenCalled();
    expect(repo.applyWorkflowRevision).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('старая ревизия: стадия обновляется, переход вне каталога — в архив, системная публикация', async () => {
    const { bootstrap, repo, eventBus, tx } = setup({
      workflows: { 'task.default': { customizedAt: null, catalogRevision: 1 } },
      stageOverrides: { on_control: { name: 'Ждёт контроля', systemState: 'done' } },
      legacyTransitions: [{ id: 'tr-complete-new', code: 'complete_new' }],
    });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(tx, uuidFor('on_control'), {
      name: 'На утверждении',
    });
    expect(repo.archiveTransition).toHaveBeenCalledWith(tx, 'tr-complete-new', expect.any(Date));
    expect(repo.applyWorkflowRevision).toHaveBeenCalledWith(tx, 'wf-standard', CATALOG_REVISION);
    // Группа on_control не менялась (done → done) — пересчитывать нечего.
    expect(eventBus.emit).toHaveBeenCalledWith(
      tx,
      TASK_EVENTS.WORKFLOW_PUBLISHED,
      { workflowId: 'wf-standard', typeIds: ['type-task'], version: 5, moves: [], restates: [] },
      { actorId: null, aggregateType: 'workflow', aggregateId: 'wf-standard' },
    );
  });

  it('каталог сменил группу статуса — задачи пересчитываются фоном (restates события)', async () => {
    const { bootstrap, repo, eventBus, tx } = setup({
      workflows: stale('task.default'),
      stageOverrides: { on_control: { systemState: 'active' } },
    });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(tx, uuidFor('on_control'), {
      systemState: 'done',
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      tx,
      TASK_EVENTS.WORKFLOW_PUBLISHED,
      expect.objectContaining({
        restates: [{ stageId: uuidFor('on_control'), systemState: 'done' }],
      }),
      expect.anything(),
    );
  });

  it('шаблон «Моего плана»: колонка «На утверждении», без события публикации', async () => {
    const { bootstrap, repo, eventBus, tx } = setup({
      workflows: stale('personal.template'),
      stageOverrides: { done: { name: 'На контроле' } },
    });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(tx, uuidFor('done'), {
      name: 'На утверждении',
    });
    expect(repo.applyWorkflowRevision).toHaveBeenCalledWith(tx, 'wf-personal', CATALOG_REVISION);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('новая установка: «Быстрый» засевается с нуля (все статусы и кнопки каталога)', async () => {
    const { bootstrap, repo } = setup({
      workflows: { 'task.quick': { customizedAt: null, catalogRevision: 0 } },
      emptyWorkflows: ['wf-quick'],
    });
    await bootstrap.ensure();
    const quickStages = repo.createStage.mock.calls.filter((c) => c[1] === 'wf-quick');
    expect(quickStages).toHaveLength(QUICK.stages.length);
    expect(repo.createTransition).toHaveBeenCalledTimes(QUICK.transitions.length);
  });

  it('настроенное (customizedAt) не трогается никогда', async () => {
    const { bootstrap, repo, eventBus, logger } = setup({
      workflows: {
        'task.default': { customizedAt: new Date(), catalogRevision: 1 },
        'task.quick': { customizedAt: new Date(), catalogRevision: 1 },
      },
    });
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.updateTransition).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'task.default' }),
      expect.stringContaining('skip_customized'),
    );
  });
});

describe('stageDrift', () => {
  const base = {
    name: 'A',
    color: 'info',
    sortOrder: 0,
    systemState: 'active',
    outcome: null,
    isInitial: false,
  };
  it('только разошедшиеся поля; совпадение — null', () => {
    expect(stageDrift(base, base)).toBeNull();
    expect(stageDrift(base, { ...base, isInitial: true, name: 'B' })).toEqual({
      isInitial: true,
      name: 'B',
    });
    expect(stageDrift(base, { ...base, outcome: 'success' })).toEqual({ outcome: 'success' });
  });
});
