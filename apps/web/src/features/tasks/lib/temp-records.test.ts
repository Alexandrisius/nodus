import { describe, expect, it } from 'vitest';
import type { AuthUser, TaskDetail, TaskStage } from '@nodus/contracts';

import { buildTempSubtask, initialStageOf, isTempId, TEMP_NUMBER } from './temp-records.js';

const NEW: TaskStage = {
  id: 's-new',
  name: 'Новая',
  order: 0,
  systemState: 'backlog',
  color: 'neutral',
};
const WORK: TaskStage = {
  id: 's-work',
  name: 'В работе',
  order: 1,
  systemState: 'active',
  color: 'success',
};

const PARENT = {
  id: 'parent',
  number: 105,
  title: 'Родитель',
  type: { id: 'type', code: 'task', name: 'Задача' },
  stage: WORK,
  personalStageId: 'col',
  priority: 'high',
  deadline: '2026-10-01T10:00:00.000Z',
  creator: { id: 'boss', displayName: 'Начальник', avatarUrl: null },
  assignee: { id: 'boss', displayName: 'Начальник', avatarUrl: null },
  participants: [{ id: 'co', displayName: 'Соисполнитель', avatarUrl: null }],
  project: { id: 'p', name: 'Проект' },
  parentId: null,
} as unknown as TaskDetail;

const ME: AuthUser = {
  id: 'me',
  email: 'me@nodus.by',
  displayName: 'Иванов Иван',
  permissions: [],
};

describe('temp-records: темп подзадачи (I4)', () => {
  it('явные поля: без номера, срока, проекта и участников родителя; актор — постановщик и ответственный', () => {
    const temp = buildTempSubtask(PARENT, 'Новая подзадача', [WORK, NEW], ME);
    expect(isTempId(temp.id)).toBe(true);
    expect(temp.number).toBe(TEMP_NUMBER);
    expect(temp.number).not.toBe(PARENT.number);
    expect(temp.title).toBe('Новая подзадача');
    expect(temp.parentId).toBe('parent');
    expect(temp.deadline).toBeNull();
    expect(temp.project).toBeNull();
    expect(temp.participants).toEqual([]);
    expect(temp.personalStageId).toBeNull();
    expect(temp.priority).toBe('normal');
    expect(temp.creator.id).toBe('me');
    expect(temp.assignee?.id).toBe('me');
  });

  it('стадия — начальная из кэша каталога; каталога нет — стадия родителя', () => {
    expect(buildTempSubtask(PARENT, 't', [WORK, NEW], ME).stage).toBe(NEW);
    expect(buildTempSubtask(PARENT, 't', undefined, ME).stage).toBe(WORK);
  });

  it('initialStageOf: первая по order стадия backlog, иначе первая по order', () => {
    expect(initialStageOf([WORK, NEW])).toBe(NEW);
    expect(initialStageOf([WORK])).toBe(WORK);
    expect(initialStageOf(undefined)).toBeUndefined();
  });
});
