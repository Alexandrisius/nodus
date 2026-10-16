import { describe, expect, it } from 'vitest';

import { tasksKeys } from '../api/tasks-keys.js';
import type { InvalidationTier, KeyBatcher } from './invalidation-batcher.js';
import { pushTaskKeys } from './task-invalidation.js';

function recordingBatcher(): { batcher: KeyBatcher; keys: Array<[unknown[], InvalidationTier]> } {
  const keys: Array<[unknown[], InvalidationTier]> = [];
  return {
    keys,
    batcher: {
      push: (key, tier) => keys.push([[...key], tier]),
      flush: () => {},
      dispose: () => {},
    },
  };
}

const has = (keys: Array<[unknown[], InvalidationTier]>, key: readonly unknown[]): boolean =>
  keys.some(([k]) => JSON.stringify(k) === JSON.stringify(key));

describe('pushTaskKeys (#311, #317)', () => {
  it('task.relation_changed обновляет список связей своей карточки', () => {
    const { batcher, keys } = recordingBatcher();
    pushTaskKeys(batcher, 'task.relation_changed', { taskId: 't1' });
    expect(has(keys, tasksKeys.relations('t1'))).toBe(true);
    expect(has(keys, tasksKeys.detail('t1'))).toBe(true);
  });

  it('прочие события связей не трогают, ветки — через фабрику branchAll', () => {
    const { batcher, keys } = recordingBatcher();
    pushTaskKeys(batcher, 'task.updated', { taskId: 't1' });
    expect(has(keys, tasksKeys.relations('t1'))).toBe(false);
    expect(has(keys, tasksKeys.branchAll())).toBe(true);
  });

  it('личные колонки — только доска и каталог', () => {
    const { batcher, keys } = recordingBatcher();
    pushTaskKeys(batcher, 'task.personal_stage_created', {});
    expect(keys.map(([k]) => k)).toEqual([
      [...tasksKeys.personalStages()],
      [...tasksKeys.kanbanAll()],
    ]);
  });
});
