import { describe, expect, it } from 'vitest';

import { projectRefs } from './task-items.js';
import { makeInstructionTask } from './tasks.js';
import { userIds } from './users.js';

describe('makeInstructionTask: поручение резолюции = задача (модель v2)', () => {
  it('source «letter», стадия «Новые», исполнитель — из строки поручения', () => {
    const task = makeInstructionTask({
      id: 'x-1',
      number: 251,
      title: 'Уточнить анкеровку арматуры',
      assigneeId: userIds.matorin,
      deadline: null,
      project: projectRefs.p4,
    });
    expect(task.source).toBe('letter');
    expect(task.stage.systemState).toBe('backlog');
    expect(task.assignee?.id).toBe(userIds.matorin);
    expect(task.project?.id).toBe(projectRefs.p4.id);
    expect(task.deadline).toBeNull();
  });

  it('срок поручения (дата) становится дедлайном 18:00 локального дня', () => {
    const task = makeInstructionTask({
      id: 'x-2',
      number: 252,
      title: 'Проверить ведомость стали',
      assigneeId: userIds.klevantovich,
      deadline: '2026-09-30',
      project: null,
    });
    expect(task.deadline).toBe(new Date('2026-09-30T18:00:00').toISOString());
  });
});
