import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, type AuthUser } from '@nodus/contracts';

import { PersonalStagesService } from './personal-stages.service.js';

const TX = { tx: true };
const USER = { id: 'alice', displayName: 'Алиса', permissions: [] } as unknown as AuthUser;
const col = (id: string, systemState: string) => ({
  id,
  name: id,
  color: 'neutral',
  sortOrder: 0,
  systemState,
});

function setup(stages: ReturnType<typeof col>[]) {
  const stagesRepo = {
    lockBoard: vi.fn(),
    liveStages: vi.fn().mockResolvedValue(stages),
    countLive: vi.fn().mockResolvedValue(stages.length),
    nextSortOrder: vi.fn().mockResolvedValue(5),
    create: vi.fn().mockResolvedValue(col('new', 'active')),
    setSortOrder: vi.fn(),
    update: vi.fn().mockResolvedValue(col('a1', 'paused')),
    archive: vi.fn(),
  };
  const placementsRepo = { moveColumn: vi.fn() };
  const service = new PersonalStagesService(
    { run: (fn: (tx: unknown) => unknown) => fn(TX) } as never,
    { emit: vi.fn() } as never,
    { ensurePersonal: vi.fn().mockResolvedValue('wf') } as never,
    stagesRepo as never,
    placementsRepo as never,
    {} as never,
    {} as never,
  );
  return { service, stagesRepo, placementsRepo };
}

const lockedBeforeRead = (
  repo: ReturnType<typeof setup>['stagesRepo'],
  read: 'liveStages' | 'countLive',
) => repo.lockBoard.mock.invocationCallOrder[0]! < repo[read].mock.invocationCallOrder[0]!;

describe('PersonalStagesService — сериализация правок доски', () => {
  it('архивация: лок доски владельца ДО снимка колонок; задачи — в соседнюю того же состояния', async () => {
    const { service, stagesRepo, placementsRepo } = setup([
      col('a1', 'active'),
      col('a2', 'active'),
    ]);
    await service.archive(USER, 'a1');
    expect(stagesRepo.lockBoard).toHaveBeenCalledWith('alice', TX);
    expect(lockedBeforeRead(stagesRepo, 'liveStages')).toBe(true);
    expect(placementsRepo.moveColumn).toHaveBeenCalledWith(TX, 'a1', 'a2');
    expect(stagesRepo.archive).toHaveBeenCalledWith(TX, 'a1', expect.any(Date));
  });

  it('смена состояния последней колонки — TASK_LAST_STAGE под локом', async () => {
    const { service, stagesRepo } = setup([col('a1', 'active'), col('p1', 'paused')]);
    await expect(service.update(USER, 'a1', { systemState: 'paused' })).rejects.toMatchObject({
      code: ErrorCode.TASK_LAST_STAGE,
    });
    expect(lockedBeforeRead(stagesRepo, 'liveStages')).toBe(true);
  });

  it('создание: лимит считается под тем же локом', async () => {
    const { service, stagesRepo } = setup([col('a1', 'active')]);
    await service.create(USER, { name: 'Н', color: 'info', systemState: 'active' } as never);
    expect(lockedBeforeRead(stagesRepo, 'countLive')).toBe(true);
    expect(stagesRepo.create).toHaveBeenCalledWith(TX, expect.objectContaining({ sortOrder: 5 }));
  });
});
