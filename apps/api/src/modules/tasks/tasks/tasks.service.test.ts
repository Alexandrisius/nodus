import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nodus/contracts';

import { DuplicateTaskSourceError } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

const TX = { tx: true };
const USER = { id: 'alice', displayName: 'Алиса', permissions: [] } as unknown as AuthUser;
const STAGE = {
  id: 's-new',
  name: 'Новая',
  color: 'neutral',
  sortOrder: 0,
  systemState: 'backlog',
  isInitial: true,
  archivedAt: null,
};

function setup(opts: { structural?: boolean } = {}) {
  const repo = {
    stageKeyAt: vi.fn().mockResolvedValue('a0'),
    create: vi.fn().mockResolvedValue({
      id: 't1',
      number: 7,
      title: 'T',
      systemState: 'backlog',
      projectId: null,
      parentId: null,
      source: 'manual',
      sourceId: null,
    }),
    findListRow: vi.fn().mockImplementation((id: string) => Promise.resolve({ id })),
    findLiveIdBySource: vi.fn().mockResolvedValue(null),
    lockTree: vi.fn(),
    liveAncestorId: vi.fn().mockResolvedValue('grand'),
    softDelete: vi.fn(),
    reparentChildren: vi.fn(),
  };
  const checklist = { createInitial: vi.fn() };
  const placementsRepo = { move: vi.fn(), removeAllForTask: vi.fn() };
  const workflows = {
    resolveTypeWorkflow: vi
      .fn()
      .mockResolvedValue({ typeId: 'type', workflowId: 'wf', structural: !!opts.structural }),
    load: vi.fn().mockResolvedValue({ id: 'wf', stages: [STAGE], transitions: [] }),
    findPersonalColumn: vi.fn().mockResolvedValue({ id: 'p-new', systemState: 'backlog' }),
  };
  const placements = {
    prepare: vi.fn(),
    sync: vi.fn(),
    topKey: vi.fn().mockResolvedValue('k0'),
  };
  const query = {
    visibleRow: vi.fn().mockResolvedValue({
      id: 't1',
      number: 7,
      creatorId: 'alice',
      assigneeId: 'bob',
      parentId: 'deleted-parent',
      participants: [],
    }),
  };
  const mapper = {
    toListItems: vi.fn().mockImplementation((rows: { id: string }[]) => Promise.resolve(rows)),
  };
  const profiles = {
    filterActiveUserIds: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
  };
  const messages = {
    snapshot: vi.fn().mockResolvedValue({ conversationId: 'c1', excerpt: 'x' }),
    taskDiscussion: vi.fn(),
  };
  const eventBus = { emit: vi.fn() };
  const txRunner = { run: vi.fn((fn: (tx: unknown) => unknown) => fn(TX)) };
  const service = new TasksService(
    txRunner as never,
    eventBus as never,
    repo as never,
    checklist as never,
    placementsRepo as never,
    workflows as never,
    placements as never,
    query as never,
    mapper as never,
    profiles as never,
    messages as never,
  );
  return { service, repo, placements, placementsRepo, txRunner, eventBus };
}

describe('TasksService', () => {
  it('«В задачу»: параллельный клик проиграл unique-дедупу — задача победителя, не 409', async () => {
    const { service, repo } = setup();
    repo.findLiveIdBySource.mockResolvedValueOnce(null).mockResolvedValueOnce('winner');
    repo.create.mockRejectedValueOnce(new DuplicateTaskSourceError());
    const item = await service.create(USER, {
      title: 'Из чата',
      sourceMessageId: '00000000-0000-4000-8000-000000000001',
    } as never);
    expect(item).toEqual({ id: 'winner' });
    expect(repo.findLiveIdBySource).toHaveBeenLastCalledWith(
      'alice',
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('дубль без живого победителя (удалён) — ошибка не глотается', async () => {
    const { service, repo } = setup();
    repo.create.mockRejectedValueOnce(new DuplicateTaskSourceError());
    await expect(
      service.create(USER, { title: 'Из чата', sourceMessageId: 'm1' } as never),
    ).rejects.toBeInstanceOf(DuplicateTaskSourceError);
  });

  it('обычное создание: ключ начала колонки, стартовый чек-лист, размещения', async () => {
    const { service, repo, placements, placementsRepo } = setup();
    await service.create(USER, {
      title: 'Т',
      checklist: ['a'],
      personalStageId: 'p-new',
    } as never);
    expect(repo.stageKeyAt).toHaveBeenCalledWith(TX, 's-new', 0);
    expect(repo.create.mock.calls[0]![0]).toMatchObject({ stageOrder: 'a0', checklistTotal: 1 });
    expect(placements.prepare).toHaveBeenCalledWith(['alice']);
    expect(placements.sync).toHaveBeenCalled();
    expect(placementsRepo.move).toHaveBeenCalledWith(TX, {
      taskId: 't1',
      userId: 'alice',
      stageId: 'p-new',
      sortOrder: 'k0',
    });
  });

  it('структурный тип: в «Мой план» не ставится (ни подготовки, ни колонки)', async () => {
    const { service, placements, placementsRepo } = setup({ structural: true });
    await service.create(USER, { title: 'Раздел', personalStageId: 'p-new' } as never);
    expect(placements.prepare).toHaveBeenCalledWith([]);
    expect(placementsRepo.move).not.toHaveBeenCalled();
  });

  it('удаление: дети — к ближайшему ЖИВОМУ предку под очередью дерева', async () => {
    const { service, repo, placementsRepo } = setup();
    await service.remove({ ...USER, id: 'alice' }, 't1');
    expect(repo.lockTree).toHaveBeenCalledWith(TX);
    expect(repo.liveAncestorId).toHaveBeenCalledWith(TX, 't1');
    expect(repo.reparentChildren).toHaveBeenCalledWith(TX, 't1', 'grand');
    expect(placementsRepo.removeAllForTask).toHaveBeenCalledWith(TX, 't1');
    expect(repo.lockTree.mock.invocationCallOrder[0]).toBeLessThan(
      repo.liveAncestorId.mock.invocationCallOrder[0]!,
    );
  });
});
