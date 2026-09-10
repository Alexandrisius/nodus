import { describe, expect, it } from 'vitest';
import type { TaskListItem, TaskStage } from '@nodus/contracts';

import {
  autoMovePersonalPlacement,
  deletePersonalStagePure,
  firstPersonalStageOfState,
} from './personal-stages.js';

const stage = (id: string, order: number, systemState: TaskStage['systemState']): TaskStage => ({
  id,
  name: id,
  order,
  systemState,
  color: 'neutral',
});

const task = (personalStageId: string | null, globalStage: TaskStage): TaskListItem =>
  ({ personalStageId, stage: globalStage }) as TaskListItem;

describe('firstPersonalStageOfState', () => {
  it('возвращает первую колонку состояния по порядку доски', () => {
    const stages = [stage('a2', 1, 'active'), stage('a1', 0, 'active'), stage('b', 2, 'done')];
    expect(firstPersonalStageOfState(stages, 'active').id).toBe('a1');
  });

  it('fallback — первая колонка доски, если состояния нет', () => {
    const stages = [stage('b', 3, 'done'), stage('a', 0, 'active')];
    expect(firstPersonalStageOfState(stages, 'paused').id).toBe('a');
  });
});

describe('autoMovePersonalPlacement (встроенное автоперемещение, ADR-0008)', () => {
  it('не трогает колонку того же системного состояния (личная организация сохраняется)', () => {
    const stages = [stage('my', 0, 'active'), stage('done', 1, 'done')];
    const t = task('my', stage('global', 0, 'active'));
    autoMovePersonalPlacement(t, stages);
    expect(t.personalStageId).toBe('my');
  });

  it('переезжает в первую колонку нового состояния при его смене', () => {
    const stages = [stage('my', 0, 'active'), stage('g1', 1, 'done'), stage('g2', 2, 'done')];
    const t = task('my', stage('global', 0, 'done'));
    autoMovePersonalPlacement(t, stages);
    expect(t.personalStageId).toBe('g1');
  });

  it('null-размещение заполняется первой колонкой состояния', () => {
    const stages = [stage('n', 0, 'backlog'), stage('a', 1, 'active')];
    const t = task(null, stage('global', 0, 'active'));
    autoMovePersonalPlacement(t, stages);
    expect(t.personalStageId).toBe('a');
  });
});

describe('deletePersonalStagePure', () => {
  it('блокирует удаление единственной колонки', () => {
    const stages = [stage('only', 0, 'active')];
    const tasks = [task('only', stage('g', 0, 'active'))];
    const result = deletePersonalStagePure(stages, tasks, 'only');
    expect(result.ok).toBe(false);
    expect(stages).toHaveLength(1);
    expect(tasks[0]?.personalStageId).toBe('only');
  });

  it('перевозит задачи в первую колонку того же состояния', () => {
    const stages = [stage('x', 0, 'active'), stage('y', 1, 'active'), stage('d', 2, 'done')];
    const tasks = [task('y', stage('g', 0, 'active')), task('d', stage('h', 0, 'done'))];
    const result = deletePersonalStagePure(stages, tasks, 'y');
    expect(result.ok).toBe(true);
    expect(result.movedTo?.id).toBe('x');
    expect(tasks[0]?.personalStageId).toBe('x');
    expect(tasks[1]?.personalStageId).toBe('d');
    expect(stages.map((s) => s.id)).toEqual(['x', 'd']);
  });

  it('fallback — первая колонка доски, если состояние удаляемой было последним таким', () => {
    const stages = [stage('a', 0, 'active'), stage('p', 1, 'paused')];
    const tasks = [task('p', stage('g', 0, 'paused'))];
    const result = deletePersonalStagePure(stages, tasks, 'p');
    expect(result.ok).toBe(true);
    expect(result.movedTo?.id).toBe('a');
    expect(tasks[0]?.personalStageId).toBe('a');
  });
});
