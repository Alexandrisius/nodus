import { describe, expect, it } from 'vitest';
import type { TaskListItem, TaskStage } from '@nodus/contracts';

import {
  globalAxis,
  indexOfInStage,
  isSamePlacement,
  moveTaskToStage,
  reorderWithinStage,
} from './kanban-board.js';

const STAGE_A: TaskStage = {
  id: 'a',
  name: 'Новые',
  order: 0,
  systemState: 'backlog',
  color: 'neutral',
};
const STAGE_B: TaskStage = {
  id: 'b',
  name: 'В работе',
  order: 1,
  systemState: 'active',
  color: 'success',
};

const task = (id: string, stage: TaskStage): TaskListItem =>
  ({
    id,
    number: 1,
    title: id,
    stage,
    personalStageId: null,
    priority: 'normal',
    deadline: null,
    creator: { id: 'u', displayName: 'U', avatarUrl: null },
    assignee: null,
    participants: [],
    project: null,
    parentId: null,
    spentMinutes: 0,
    commentsCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    source: 'manual',
    updatedAt: '2026-09-01T00:00:00Z',
  }) as TaskListItem;

const board = (): TaskListItem[] => [
  task('a1', STAGE_A),
  task('a2', STAGE_A),
  task('b1', STAGE_B),
  task('b2', STAGE_B),
];

describe('kanban-board: перестановки борда', () => {
  it('moveTaskToStage: межколоночный перенос на индекс', () => {
    const next = moveTaskToStage(board(), 'a1', STAGE_B, 1, globalAxis);
    expect(next.filter((t) => t.stage.id === 'b').map((t) => t.id)).toEqual(['b1', 'a1', 'b2']);
    expect(next.find((t) => t.id === 'a1')?.stage.id).toBe('b');
  });

  it('moveTaskToStage: индекс за концом колонки — в конец', () => {
    const next = moveTaskToStage(board(), 'a2', STAGE_B, 99, globalAxis);
    expect(next.filter((t) => t.stage.id === 'b').map((t) => t.id)).toEqual(['b1', 'b2', 'a2']);
  });

  it('moveTaskToStage: в пустую колонку', () => {
    const items = board().filter((t) => t.stage.id === 'a');
    const next = moveTaskToStage(items, 'a1', STAGE_B, 0, globalAxis);
    expect(next.map((t) => t.id)).toEqual(['a2', 'a1']);
    expect(next.find((t) => t.id === 'a1')?.stage.id).toBe('b');
  });

  it('reorderWithinStage: перестановка внутри колонки, чужая колонка не трогается', () => {
    const next = reorderWithinStage(board(), 'a2', 'a1', globalAxis);
    expect(next.filter((t) => t.stage.id === 'a').map((t) => t.id)).toEqual(['a2', 'a1']);
    expect(reorderWithinStage(board(), 'a1', 'b1', globalAxis)).toEqual(board());
  });

  it('indexOfInStage: позиция внутри колонки, а не массива', () => {
    expect(indexOfInStage(board(), 'b2', globalAxis)).toBe(1);
    expect(indexOfInStage(board(), 'nope', globalAxis)).toBe(-1);
  });

  it('isSamePlacement: идентичное размещение не создаёт повода для setState', () => {
    expect(isSamePlacement(board(), [...board()], globalAxis)).toBe(true);
    expect(
      isSamePlacement(board(), moveTaskToStage(board(), 'a1', STAGE_A, 0, globalAxis), globalAxis),
    ).toBe(true);
    expect(
      isSamePlacement(board(), moveTaskToStage(board(), 'a1', STAGE_B, 0, globalAxis), globalAxis),
    ).toBe(false);
  });

  it('isSamePlacement: переезд в пустую колонку с конца массива — НЕ то же размещение (регрессия)', () => {
    // b2 — последняя в плоском массиве; переезд в пустую C ставит её в конец
    // снова: порядок id совпадает, но колонка другая — setState обязан пройти.
    const STAGE_C: TaskStage = {
      id: 'c',
      name: 'Готово',
      order: 2,
      systemState: 'done',
      color: 'neutral',
    };
    const moved = moveTaskToStage(board(), 'b2', STAGE_C, 0, globalAxis);
    expect(moved.map((t) => t.id)).toEqual(board().map((t) => t.id));
    expect(isSamePlacement(board(), moved, globalAxis)).toBe(false);
  });
});
