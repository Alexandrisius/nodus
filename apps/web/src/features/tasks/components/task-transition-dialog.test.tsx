// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TaskListItem, WorkflowTransition } from '@nodus/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransitionDialog } from './task-transition-dialog.js';

const SUBTASK = {
  id: '30000000-0000-4000-8000-000000000201',
  number: 201,
  title: 'Согласовать смету',
  stage: { name: 'В работе', systemState: 'active', color: 'green' },
} as unknown as TaskListItem;

const GATE = {
  task: { subtasks: [SUBTASK], checklistDone: 0, checklistTotal: 0 },
  definitions: [],
};

const TRANSITION = {
  id: '60000000-0000-4000-8000-000000000001',
  name: 'Завершить',
  toStageId: '60000000-0000-4000-8000-000000000002',
  toStageName: 'Завершена',
  toStageState: 'closed',
  toStageOutcome: 'success',
  toStageColor: 'blue',
  toStageOrder: 3,
  display: 'primary',
  blockedBy: [{ kind: 'no_open_subtasks', count: 1 }],
  canOverride: true,
  form: null,
  validators: [{ kind: 'no_open_subtasks' }],
} as unknown as WorkflowTransition;

describe('TransitionDialog: отказ без автозакрытия подзадач (#391)', () => {
  afterEach(cleanup);

  it('не предлагает «Завершить вместе с подзадачами» и показывает список мешающих', () => {
    render(
      <TransitionDialog
        transition={TRANSITION}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        executing={false}
        gate={GATE}
      />,
    );

    expect(screen.queryByText(/Завершить вместе с подзадачами/)).toBeNull();
    expect(screen.getByText('Есть незавершённые подзадачи')).toBeTruthy();
    expect(screen.getByText('Согласовать смету')).toBeTruthy();
    expect(screen.getByText('В работе')).toBeTruthy();
  });

  it('переход к подзадаче из списка закрывает диалог и отдаёт id', () => {
    const onOpenSubtask = vi.fn();
    render(
      <TransitionDialog
        transition={TRANSITION}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        executing={false}
        gate={{ ...GATE, onOpenSubtask }}
      />,
    );

    fireEvent.click(screen.getByTitle('Открыть подзадачи'));
    expect(onOpenSubtask).toHaveBeenCalledWith(SUBTASK.id);
  });
});
