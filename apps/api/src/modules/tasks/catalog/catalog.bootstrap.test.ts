import { describe, expect, it, vi } from 'vitest';

import { CatalogBootstrap, stageDrift } from './catalog.bootstrap.js';
import { CATALOG_TASK_TYPES, PERSONAL_TEMPLATE } from './system-catalog.js';

type StageOverride = Partial<{
  systemState: string;
  sortOrder: number;
  name: string;
  outcome: string | null;
}>;

interface DbState {
  /** workflowId → { customizedAt, catalogRevision }. */
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

/** id стадий — детерминированные uuid (цели route_if валидируются zod). */
const uuidFor = (code: string): string => {
  const codes = [...STANDARD.stages, ...QUICK.stages, ...PERSONAL_TEMPLATE.stages].map(
    (s) => s.code,
  );
  const index = codes.indexOf(code);
  return `00000000-0000-4000-8000-00000000${String(index).padStart(4, '0')}`;
};

/** Мок БД: каталог применён наполовину; validate семантики «засев один раз». */
function setup(state: Partial<DbState> = {}) {
  const workflows: DbState['workflows'] = {
    [STANDARD.code]: {
      customizedAt: null,
      catalogRevision: state.workflows?.[STANDARD.code]?.catalogRevision ?? 2,
    },
    [QUICK.code]: {
      customizedAt: null,
      catalogRevision: state.workflows?.[QUICK.code]?.catalogRevision ?? 2,
    },
    [PERSONAL_TEMPLATE.code]: {
      customizedAt: null,
      catalogRevision: state.workflows?.[PERSONAL_TEMPLATE.code]?.catalogRevision ?? 2,
    },
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
    restateStageTasks: vi.fn().mockResolvedValue(3),
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
  const prisma = {
    workflowScheme: { findFirst: vi.fn().mockResolvedValue({ id: 'scheme' }) },
    workflow: {
      findUniqueOrThrow: vi
        .fn()
        .mockImplementation(({ where: { id } }: { where: { id: string } }) => {
          const byId =
            id === 'wf-standard'
              ? STANDARD.code
              : id === 'wf-quick'
                ? QUICK.code
                : PERSONAL_TEMPLATE.code;
          return Promise.resolve(workflows[byId]!);
        }),
      update: vi.fn(),
    },
    taskType: {
      findUniqueOrThrow: vi
        .fn()
        .mockImplementation(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve({ customizedAt: typeCustomized[id] ?? null }),
        ),
      update: vi.fn(),
    },
  };
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const TX = {
    tx: true,
    workflowScheme: prisma.workflowScheme,
    workflow: prisma.workflow,
    taskType: prisma.taskType,
  };
  const bootstrap = new CatalogBootstrap(
    { run: (fn: (tx: unknown) => unknown) => fn(TX) } as never,
    repo as never,
    logger as never,
  );
  return { bootstrap, repo, logger, tx: TX as never };
}

describe('CatalogBootstrap — «засев один раз» (ADR-0021)', () => {
  it('ревизия применена — повторный прогон ничего не меняет', async () => {
    const { bootstrap, repo } = setup();
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.createStage).not.toHaveBeenCalled();
    expect(repo.updateTransition).not.toHaveBeenCalled();
    expect(repo.createTransition).not.toHaveBeenCalled();
    expect(repo.archiveTransition).not.toHaveBeenCalled();
  });

  it('ревизия 1 → 2: стадия каталога обновляется, задачи пересчитываются', async () => {
    const { bootstrap, repo, tx } = setup({
      workflows: {
        'task.default': { customizedAt: null, catalogRevision: 1 },
        'task.quick': { customizedAt: null, catalogRevision: 2 },
        'personal.template': { customizedAt: null, catalogRevision: 2 },
      },
      stageOverrides: { on_control: { name: 'Ждёт контроля', systemState: 'done' } },
      legacyTransitions: [{ id: 'tr-complete-new', code: 'complete_new' }],
    });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(tx, uuidFor('on_control'), {
      name: 'На утверждении',
    });
    // Смена этапа ревизии 1 → 2 у on_control нет (done → done) — пересчёта нет.
    expect(repo.restateStageTasks).not.toHaveBeenCalled();
    // Переход ревизии 1, не вошедший в ревизию 2, — архивируется.
    expect(repo.archiveTransition).toHaveBeenCalledWith(tx, 'tr-complete-new', expect.any(Date));
  });

  it('новая установка: «Быстрый» засевается с нуля (все статусы и кнопки каталога)', async () => {
    const { bootstrap, repo } = setup({
      workflows: {
        'task.default': { customizedAt: null, catalogRevision: 2 },
        'task.quick': { customizedAt: null, catalogRevision: 0 },
        'personal.template': { customizedAt: null, catalogRevision: 2 },
      },
      emptyWorkflows: ['wf-quick'],
    });
    await bootstrap.ensure();
    const quickStages = repo.createStage.mock.calls.filter((c) => c[1] === 'wf-quick');
    expect(quickStages).toHaveLength(QUICK.stages.length);
    expect(repo.createTransition).toHaveBeenCalledTimes(QUICK.transitions.length);
  });

  it('настроенное (customizedAt) не трогается никогда', async () => {
    const { bootstrap, repo, logger } = setup({
      workflows: {
        'task.default': { customizedAt: new Date(), catalogRevision: 1 },
        'task.quick': { customizedAt: new Date(), catalogRevision: 1 },
        'personal.template': { customizedAt: null, catalogRevision: 2 },
      },
    });
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.updateTransition).not.toHaveBeenCalled();
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
