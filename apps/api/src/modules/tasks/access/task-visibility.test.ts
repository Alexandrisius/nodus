import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import { visibleTasksWhere } from './task-visibility.js';

const viewer = { id: 'me', permissions: [] as string[], subordinateIds: [] as string[] };

describe('visibleTasksWhere', () => {
  it('mine — только собственное участие, удалённые скрыты', () => {
    const where = visibleTasksWhere({ ...viewer, subordinateIds: ['sub'] }, 'mine');
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where)).not.toContain('sub');
  });

  it('all — плюс задачи подчинённых', () => {
    const where = visibleTasksWhere({ ...viewer, subordinateIds: ['sub'] }, 'all');
    expect(where.OR).toHaveLength(6);
    expect(JSON.stringify(where)).toContain('sub');
  });

  it('task.view_all — все живые задачи; mine — по-прежнему только своё', () => {
    const viewAll = { ...viewer, permissions: [Permission.TASK_VIEW_ALL] };
    expect(visibleTasksWhere(viewAll, 'all')).toEqual({ deletedAt: null });
    expect(visibleTasksWhere(viewAll, 'mine').OR).toHaveLength(3);
  });

  it('без прав и подчинённых all = mine', () => {
    expect(visibleTasksWhere(viewer, 'all').OR).toHaveLength(3);
  });
});
