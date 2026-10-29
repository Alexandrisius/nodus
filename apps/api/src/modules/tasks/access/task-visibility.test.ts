import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import { visibleTasksWhere } from './task-visibility.js';

const viewer = {
  id: 'me',
  permissions: [] as string[],
  subordinateIds: [] as string[],
  visibleProjectIds: [] as string[],
  hiddenProjectIds: [] as string[],
};

describe('visibleTasksWhere (#37 + #52 Р3)', () => {
  it('mine — только собственное участие, удалённые скрыты', () => {
    const where = visibleTasksWhere({ ...viewer, subordinateIds: ['sub'] }, 'mine');
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where)).not.toContain('sub');
    // проекты не расширяют mine: свой срез — только личное участие
    expect(JSON.stringify(where)).not.toContain('projectId');
  });

  it('all — своё участие (гейтнутое), подчинённые и видимые проекты', () => {
    const where = visibleTasksWhere(
      { ...viewer, subordinateIds: ['sub'], visibleProjectIds: ['p-1'] },
      'all',
    );
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where)).toContain('"in"');
  });

  it('подчинённые не раскрывают секретные проекты: ветка гейтится скрытыми', () => {
    const where = visibleTasksWhere(
      { ...viewer, subordinateIds: ['sub'], hiddenProjectIds: ['secret-1'] },
      'all',
    );
    // [0] — моё участие (тоже гейтнуто), [1] — подчинённые
    const subordinateBranch = where.OR![1] as { AND: unknown[] };
    expect(subordinateBranch.AND).toHaveLength(2); // involves + гейт
    const gate = subordinateBranch.AND[1] as { OR: unknown[] };
    // NULL-ветка обязательна: NULL NOT IN прячет задачи без проекта (Р3)
    expect(gate.OR[0]).toEqual({ projectId: null });
    expect(gate.OR[1]).toEqual({ projectId: { notIn: ['secret-1'] } });
  });

  it('без скрытых проектов ветка подчинённых без гейта (как до Р3)', () => {
    const where = visibleTasksWhere({ ...viewer, subordinateIds: ['sub'] }, 'all');
    const subordinateBranch = where.OR![1] as { OR: unknown[]; AND?: unknown[] };
    expect(subordinateBranch.AND).toBeUndefined();
    expect(subordinateBranch.OR).toHaveLength(3);
  });

  it('task.view_all — все живие задачи; скрытые проекты гейтятся (Т1)', () => {
    const viewAll = { ...viewer, permissions: [Permission.TASK_VIEW_ALL] };
    // скрытых нет — весь фонд без оговорок
    expect(visibleTasksWhere(viewAll, 'all')).toEqual({ deletedAt: null });
    // скрытые есть — гейт остаётся и у админа (не ранний return)
    expect(visibleTasksWhere({ ...viewAll, hiddenProjectIds: ['secret-1'] }, 'all')).toEqual({
      deletedAt: null,
      AND: [{ OR: [{ projectId: null }, { projectId: { notIn: ['secret-1'] } }] }],
    });
    // mine — по-прежнему только своё
    expect(visibleTasksWhere(viewAll, 'mine').OR).toHaveLength(3);
  });

  it('без прав, подчинённых и проектов all = mine (гейт-обёртка)', () => {
    const where = visibleTasksWhere(viewer, 'all');
    expect(where.OR).toHaveLength(1);
    expect((where.OR![0] as { OR: unknown[] }).OR).toHaveLength(3);
  });
});
