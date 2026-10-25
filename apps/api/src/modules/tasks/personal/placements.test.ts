import { describe, expect, it, vi } from 'vitest';

import { Placements } from './placements.js';

const TX = { tx: true };

function setup() {
  const repo = {
    removeExcept: vi.fn(),
    listForTask: vi.fn().mockResolvedValue([]),
    topKey: vi.fn().mockResolvedValue('k0'),
    place: vi.fn(),
  };
  const boards = {
    personalStagesOf: vi.fn().mockResolvedValue([
      { id: 'a-b', systemState: 'backlog', workflow: { ownerId: 'alice' } },
      { id: 'b-b', systemState: 'backlog', workflow: { ownerId: 'bob' } },
    ]),
  };
  const placements = new Placements(boards as never, repo as never, { emit: vi.fn() } as never);
  return { placements, repo, boards };
}

describe('Placements.sync', () => {
  it('обычная задача — карточка у каждого держателя в колонке его состояния', async () => {
    const { placements, repo } = setup();
    await placements.sync(
      TX as never,
      { id: 't1', systemState: 'backlog' },
      ['alice', 'bob'],
      'alice',
    );
    expect(repo.removeExcept).toHaveBeenCalledWith(TX, 't1', ['alice', 'bob']);
    expect(repo.place).toHaveBeenCalledTimes(2);
    expect(repo.place).toHaveBeenCalledWith(TX, {
      taskId: 't1',
      userId: 'bob',
      stageId: 'b-b',
      sortOrder: 'k0',
    });
  });

  it('без держателей плана размещения снимаются (карточка уходит из «Моего плана»)', async () => {
    const { placements, repo } = setup();
    await placements.sync(TX as never, { id: 't1', systemState: 'backlog' }, [], 'alice');
    expect(repo.removeExcept).toHaveBeenCalledWith(TX, 't1', []);
    expect(repo.place).not.toHaveBeenCalled();
  });
});
