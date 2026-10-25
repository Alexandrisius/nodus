import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { ProcessTypesService } from './process-types.service.js';

/** Библиотека типов процессов (#378, #428): уникальность имени, тип рождается
 *  скрытым, основа «копия типа» / «простой», системный тип не архивируется,
 *  категория неизменяема (основа — только того же вида). */

const USER = { id: 'u1', permissions: [] } as never;
const TX = { tx: true };

function setup(opts: { taken?: boolean; type?: Record<string, unknown> | null } = {}) {
  const repo = {
    findLiveByName: vi.fn(async () => (opts.taken ? { id: 'other' } : null)),
    maxSortOrder: vi.fn(async () => 5),
    createType: vi.fn(async (_tx: unknown, data: Record<string, unknown>) => ({
      id: 'new-type',
      isSystem: false,
      ...data,
    })),
    updateType: vi.fn(async () => void 0),
    findById: vi.fn(async () =>
      opts.type === undefined ? { id: 't', name: 'A', category: 'task' } : opts.type,
    ),
    attachToDefaultScheme: vi.fn(async () => void 0),
    createSimpleWorkflow: vi.fn(async () => 'wf-simple'),
    workflowIdOf: vi.fn(async () => 'wf-src'),
    copyWorkflow: vi.fn(async () => 'wf-copy'),
  };
  const workflows = { load: vi.fn(async () => ({ id: 'wf-src', stages: [], transitions: [] })) };
  const emit = vi.fn(async () => void 0);
  const service = new ProcessTypesService(
    { run: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) } as never,
    repo as never,
    workflows as never,
    { emit } as never,
  );
  return { service, repo, workflows, emit };
}

const body = (base: unknown, extra: Record<string, unknown> = {}) =>
  ({
    name: 'Задание сметчикам',
    category: 'task',
    icon: 'calculator',
    color: 'info',
    base,
    ...extra,
  }) as never;

describe('ProcessTypesService (#378)', () => {
  it('имя занято — PROCESS_TYPE_NAME_TAKEN, ничего не создаётся', async () => {
    const { service, repo } = setup({ taken: true });
    await expect(service.create(USER, body({ kind: 'simple' }))).rejects.toMatchObject({
      code: ErrorCode.PROCESS_TYPE_NAME_TAKEN,
    });
    expect(repo.createType).not.toHaveBeenCalled();
  });

  it('создание: скрытый тип с серверным кодом, основа «простой», событие', async () => {
    const { service, repo, emit } = setup();
    const created = await service.create(USER, body({ kind: 'simple' }));
    expect(repo.createType).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ creatable: false, code: expect.stringMatching(/^custom-/) }),
    );
    expect(created).toMatchObject({ creatable: false, workflowId: 'wf-simple' });
    expect(repo.attachToDefaultScheme).toHaveBeenCalledWith(TX, 'new-type', 'wf-simple');
    expect(emit).toHaveBeenCalledWith(
      TX,
      'workflow.type_created',
      { typeId: 'new-type', name: 'Задание сметчикам', category: 'task' },
      expect.anything(),
    );
  });

  it('основа «копия типа»: маршрут источника копируется новыми id', async () => {
    const { service, repo, workflows } = setup();
    const created = await service.create(USER, body({ kind: 'copy', typeId: 'src-type' }));
    expect(repo.workflowIdOf).toHaveBeenCalledWith('src-type');
    expect(workflows.load).toHaveBeenCalledWith('wf-src', TX);
    expect(created.workflowId).toBe('wf-copy');
  });

  it('основа — архивный тип: 404, ничего не создаётся', async () => {
    const { service, repo } = setup({
      type: { id: 'src-type', archivedAt: new Date(), category: 'task' },
    });
    await expect(
      service.create(USER, body({ kind: 'copy', typeId: 'src-type' })),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(repo.copyWorkflow).not.toHaveBeenCalled();
  });

  it('основа чужой категории: 404 (маршрут письма не основа задачи)', async () => {
    const { service, repo } = setup({ type: { id: 'src-type', category: 'letter' } });
    await expect(
      service.create(USER, body({ kind: 'copy', typeId: 'src-type' })),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(repo.copyWorkflow).not.toHaveBeenCalled();
  });

  it('системный тип в архив нельзя — PROCESS_TYPE_SYSTEM_LOCKED', async () => {
    const { service, repo } = setup({ type: { id: 't', isSystem: true, category: 'task' } });
    await expect(service.setArchived(USER, 't', true)).rejects.toMatchObject({
      code: ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED,
    });
    expect(repo.updateType).not.toHaveBeenCalled();
  });

  it('правка свойств ставит customizedAt (каталог больше не трогает тип)', async () => {
    const { service, repo } = setup();
    await service.update(USER, 't', { creatable: true } as never);
    expect(repo.updateType).toHaveBeenCalledWith(
      TX,
      't',
      expect.objectContaining({ creatable: true, customizedAt: expect.any(Date) }),
    );
  });
});
