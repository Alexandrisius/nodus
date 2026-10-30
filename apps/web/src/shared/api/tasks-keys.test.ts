import { describe, expect, it } from 'vitest';

import { projectsKeys } from './projects-list.js';
import { taskDependentKeys } from './tasks-keys.js';

describe('taskDependentKeys', () => {
  it('включает агрегаты узлов структуры (#467): прогресс/часы узла после правки задачи', () => {
    expect(taskDependentKeys('t1')).toContainEqual([...projectsKeys.structures()]);
  });
});
