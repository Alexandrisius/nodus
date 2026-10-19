import { describe, expect, it } from 'vitest';
import type { TaskListItem, TaskStage } from '@nodus/contracts';

import { globalAxis } from './kanban-board.js';
import { mergeRefreshedColumns } from './kanban-merge.js';

const stage = (id: string): TaskStage => ({
  id,
  name: id,
  order: 0,
  systemState: 'active',
  color: 'neutral',
});
const task = (id: string, stageId: string): TaskListItem =>
  ({ id, number: 1, title: id, stage: stage(stageId), personalStageId: null }) as TaskListItem;

const ids = (board: TaskListItem[], stageId: string) =>
  board.filter((t) => t.stage.id === stageId).map((t) => t.id);

describe('mergeRefreshedColumns (#322)', () => {
  it('обновлённая колонка заменяется целиком, прочие — с догрузками и порядком', () => {
    const prev = [task('a1', 'A'), task('a2', 'A'), task('b1', 'B'), task('b2', 'B')];
    const board = mergeRefreshedColumns(prev, new Map([['A', [task('a3', 'A')]]]), globalAxis);
    expect(ids(board, 'A')).toEqual(['a3']);
    expect(ids(board, 'B')).toEqual(['b1', 'b2']);
  });

  it('переехавшая задача не дублируется, даже если её прежняя колонка не перезапрашивалась', () => {
    const prev = [task('t1', 'A'), task('a2', 'A'), task('b1', 'B')];
    const board = mergeRefreshedColumns(
      prev,
      new Map([['B', [task('t1', 'B'), task('b1', 'B')]]]),
      globalAxis,
    );
    expect(ids(board, 'A')).toEqual(['a2']);
    expect(ids(board, 'B')).toEqual(['t1', 'b1']);
    expect(board.filter((t) => t.id === 't1')).toHaveLength(1);
  });

  it('первая сборка: все колонки свежие — борд из фидов', () => {
    const board = mergeRefreshedColumns(
      [],
      new Map([
        ['A', [task('a1', 'A')]],
        ['B', []],
      ]),
      globalAxis,
    );
    expect(board.map((t) => t.id)).toEqual(['a1']);
  });
});
