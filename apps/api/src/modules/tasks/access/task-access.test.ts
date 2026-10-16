import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import { actorRoles, audienceIds, planHolderIds, taskAccess } from './task-access.js';

const task = {
  creatorId: 'c',
  assigneeId: 'a',
  participants: [
    { userId: 'co', role: 'coexecutor' },
    { userId: 'ob', role: 'observer' },
  ],
};

describe('task-access', () => {
  it('роли актора', () => {
    expect([...actorRoles(task, 'c')]).toEqual(['creator']);
    expect([...actorRoles({ ...task, assigneeId: 'c' }, 'c')]).toEqual(['creator', 'assignee']);
    expect([...actorRoles(task, 'ob')]).toEqual(['observer']);
    expect(actorRoles(task, 'stranger').size).toBe(0);
  });

  it('наблюдатель только читает; соисполнитель — время и чек-лист', () => {
    expect(taskAccess(actorRoles(task, 'ob'), [])).toEqual({
      canEdit: false,
      canManageParticipants: false,
      canLogTime: false,
      canCheck: false,
      canDelete: false,
    });
    expect(taskAccess(actorRoles(task, 'co'), [])).toMatchObject({
      canEdit: false,
      canLogTime: true,
      canCheck: true,
    });
  });

  it('постановщик удаляет и правит, но время не пишет; manage_any — всё', () => {
    expect(taskAccess(actorRoles(task, 'c'), [])).toMatchObject({
      canEdit: true,
      canDelete: true,
      canLogTime: false,
    });
    expect(Object.values(taskAccess(new Set(), [Permission.TASK_MANAGE_ANY]))).not.toContain(false);
  });

  it('«Мой план» — без наблюдателей; аудитория событий — все', () => {
    expect(planHolderIds(task).sort()).toEqual(['a', 'c', 'co']);
    expect(audienceIds(task, ['gone']).sort()).toEqual(['a', 'c', 'co', 'gone', 'ob']);
  });
});
