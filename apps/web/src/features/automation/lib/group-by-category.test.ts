import { describe, expect, it } from 'vitest';
import type { ProcessType } from '@nodus/contracts';

import { groupByCategory } from './group-by-category.js';

const type = (id: string, category: 'task' | 'letter'): ProcessType => ({
  id,
  code: id,
  name: id,
  category,
  direction: category === 'letter' ? 'incoming' : null,
  icon: 'square-check',
  color: 'neutral',
  description: '',
  creatable: true,
  isSystem: false,
  sortOrder: 0,
  archivedAt: null,
  workflowId: `wf-${id}`,
});

describe('groupByCategory (#428)', () => {
  it('одна категория — одна группа (заголовков не будет)', () => {
    const groups = groupByCategory([type('a', 'task'), type('b', 'task')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe('task');
    expect(groups[0]!.types.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('две категории — две группы, порядок первого вхождения', () => {
    const groups = groupByCategory([type('a', 'task'), type('b', 'letter'), type('c', 'task')]);
    expect(groups.map((g) => g.category)).toEqual(['task', 'letter']);
    expect(groups[0]!.types.map((t) => t.id)).toEqual(['a', 'c']);
    expect(groups[1]!.types.map((t) => t.id)).toEqual(['b']);
  });

  it('пустой список — пустые группы', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
