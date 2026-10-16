import { describe, expect, it } from 'vitest';

import { taskNotices } from './task-notifications.js';

describe('taskNotices', () => {
  it('создание: ответственному и соисполнителям, не себе', () => {
    const n = taskNotices(
      'task.created',
      { number: 7, title: 'Справка', assigneeId: 'a', coexecutorIds: ['c', 'me'] },
      'me',
    );
    expect(n.map((x) => [x.userId, x.kind])).toEqual([
      ['a', 'action.assignment'],
      ['c', 'action.assignment'],
    ]);
    expect(n[0]!.preview).toBe('ПП-7 · Справка');
  });

  it('завершение — постановщику, возврат — ответственному', () => {
    const base = { number: 1, toStageName: 'Ждёт контроля', creatorId: 'cr', assigneeId: 'as' };
    expect(
      taskNotices('task.stage_changed', { ...base, fromState: 'active', toState: 'done' }, 'as'),
    ).toMatchObject([{ userId: 'cr', kind: 'task.completed' }]);
    expect(
      taskNotices('task.stage_changed', { ...base, fromState: 'done', toState: 'active' }, 'cr'),
    ).toMatchObject([{ userId: 'as', kind: 'task.returned' }]);
    expect(
      taskNotices('task.stage_changed', { ...base, fromState: 'backlog', toState: 'active' }, 'as'),
    ).toEqual([]);
  });

  it('просрочка — обоим без дублей; наблюдатель в составе — без уведомления', () => {
    expect(
      taskNotices('task.overdue', { number: 2, title: 'T', assigneeId: 'x', creatorId: 'x' }, null),
    ).toHaveLength(1);
    expect(
      taskNotices(
        'task.participants_changed',
        { number: 2, title: 'T', added: [{ userId: 'o', role: 'observer' }] },
        'me',
      ),
    ).toEqual([]);
  });
});
