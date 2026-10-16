import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, TASK_EVENTS, type AuthUser } from '@nodus/contracts';

import { RelationsService } from './relations.service.js';

const TX = { tx: true };
const USER = { id: 'alice', displayName: 'Алиса', permissions: [] } as unknown as AuthUser;
const roster = (id: string, number: number, assigneeId: string) => ({
  id,
  number,
  creatorId: 'alice',
  assigneeId,
  participants: [],
});

function setup(removed: { fromTaskId: string; toTaskId: string } | null) {
  const repo = {
    ensure: vi.fn(),
    removeOfTask: vi.fn().mockResolvedValue(removed),
    listOutgoing: vi.fn().mockResolvedValue([]),
    listIncoming: vi.fn().mockResolvedValue([]),
  };
  const tasksRepo = { findLiveRoster: vi.fn().mockResolvedValue(roster('t2', 8, 'carol')) };
  const query = {
    visibleRow: vi
      .fn()
      .mockImplementation((_u: unknown, id: string) =>
        Promise.resolve(id === 't1' ? roster('t1', 7, 'bob') : roster('t2', 8, 'carol')),
      ),
    viewer: vi.fn().mockResolvedValue({ id: 'alice', permissions: [], subordinateIds: [] }),
  };
  const eventBus = { emit: vi.fn() };
  const service = new RelationsService(
    repo as never,
    tasksRepo as never,
    { run: (fn: (tx: unknown) => unknown) => fn(TX) } as never,
    eventBus as never,
    query as never,
  );
  return { service, eventBus, tasksRepo };
}

const emitted = (emit: ReturnType<typeof vi.fn>) =>
  emit.mock.calls.map((c) => [c[1], (c[2] as { taskId: string; audience: string[] }).taskId]);

describe('RelationsService', () => {
  it('связь: task.relation_changed по ОБЕИМ карточкам (своя аудитория у каждой)', async () => {
    const { service, eventBus } = setup(null);
    await service.add(USER, 't1', { toTaskId: 't2', kind: 'relates' } as never);
    expect(emitted(eventBus.emit)).toEqual([
      [TASK_EVENTS.RELATION_CHANGED, 't1'],
      [TASK_EVENTS.RELATION_CHANGED, 't2'],
    ]);
    expect(eventBus.emit.mock.calls[1]![2].audience).toEqual(['alice', 'carol']);
  });

  it('снятие связи со стороны входящей — событие и второй карточке', async () => {
    const { service, eventBus, tasksRepo } = setup({ fromTaskId: 't2', toTaskId: 't1' });
    await service.remove(USER, 't1', 'r1');
    expect(tasksRepo.findLiveRoster).toHaveBeenCalledWith('t2', TX);
    expect(emitted(eventBus.emit)).toEqual([
      [TASK_EVENTS.RELATION_CHANGED, 't1'],
      [TASK_EVENTS.RELATION_CHANGED, 't2'],
    ]);
  });

  it('вторая сторона удалена — событие только своей карточке; нет связи — 404', async () => {
    const gone = setup({ fromTaskId: 't1', toTaskId: 't2' });
    gone.tasksRepo.findLiveRoster.mockResolvedValueOnce(null);
    await gone.service.remove(USER, 't1', 'r1');
    expect(emitted(gone.eventBus.emit)).toEqual([[TASK_EVENTS.RELATION_CHANGED, 't1']]);

    const none = setup(null);
    await expect(none.service.remove(USER, 't1', 'r1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
