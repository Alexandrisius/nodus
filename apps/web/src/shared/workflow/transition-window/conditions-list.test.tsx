// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { TaskListItem } from '@nodus/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { ConditionsList } from './conditions-list.js';
import type { WindowConditionLine } from './window-conditions.js';

const OPEN_SUBTASK = {
  id: '30000000-0000-4000-8000-000000000301',
  number: 301,
  title: 'Согласовать смету',
  stage: { name: 'В работе', systemState: 'active', color: 'green' },
} as unknown as TaskListItem;

const TASK = { subtasks: [OPEN_SUBTASK], checklistDone: 2, checklistTotal: 5 };

const lines = (ok: boolean): WindowConditionLine[] => [
  { validator: { kind: 'no_open_subtasks' }, ok, fixable: false },
];

describe('ConditionsList: формулировки условий окна перехода (#511)', () => {
  afterEach(cleanup);

  it('при ✗ называет проблему, а не положительное условие', () => {
    render(
      <ConditionsList
        lines={lines(false)}
        reasons={[{ kind: 'no_open_subtasks', count: 1 }]}
        gate={{ task: TASK, definitions: [] }}
      />,
    );

    expect(screen.getByText('Есть незавершённые подзадачи')).toBeTruthy();
    expect(screen.queryByText('Нет незавершённых подзадач')).toBeNull();
    expect(screen.getByText('Согласовать смету')).toBeTruthy();
  });

  it('при ✓ показывает положительную формулировку и не тянет список подзадач', () => {
    render(<ConditionsList lines={lines(true)} gate={{ task: TASK, definitions: [] }} />);

    expect(screen.getByText('Нет незавершённых подзадач')).toBeTruthy();
    expect(screen.queryByText('Есть незавершённые подзадачи')).toBeNull();
    expect(screen.queryByText('Согласовать смету')).toBeNull();
  });

  it('у незакрытого чек-листа оставляет числа «n из m»', () => {
    render(
      <ConditionsList
        lines={[{ validator: { kind: 'checklist_complete' }, ok: false, fixable: false }]}
        reasons={[{ kind: 'checklist_complete' }]}
        gate={{ task: TASK, definitions: [] }}
      />,
    );

    expect(screen.getByText('Чек-лист выполнен не полностью · 2 из 5')).toBeTruthy();
  });
});
