import { describe, expect, it, vi } from 'vitest';

import { Placements } from './placements.js';

const TX = { tx: true };

function setup(structural: boolean) {
  const repo = {
    removeExcept: vi.fn(),
    listForTask: vi.fn().mockResolvedValue([]),
    topKey: vi.fn().mockResolvedValue('k0'),
    place: vi.fn(),
  };
  const workflows = {
    personalStagesOf: vi.fn().mockResolvedValue([
      { id: 'a-b', systemState: 'backlog', workflow: { ownerId: 'alice' } },
      { id: 'b-b', systemState: 'backlog', workflow: { ownerId: 'bob' } },
    ]),
  };
  const tasks = { isStructural: vi.fn().mockResolvedValue(structural) };
  const placements = new Placements(
    workflows as never,
    tasks as never,
    repo as never,
    { emit: vi.fn() } as never,
  );
  return { placements, repo };
}

describe('Placements.sync', () => {
  it('обычная задача — карточка у каждого держателя в колонке его состояния', async () => {
    const { placements, repo } = setup(false);
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

  it('структурный тип (узел дерева проекта) в «Мой план» не попадает: размещения снимаются', async () => {
    const { placements, repo } = setup(true);
    await placements.sync(
      TX as never,
      { id: 't1', systemState: 'backlog' },
      ['alice', 'bob'],
      'alice',
    );
    expect(repo.removeExcept).toHaveBeenCalledWith(TX, 't1', []);
    expect(repo.place).not.toHaveBeenCalled();
  });
});
