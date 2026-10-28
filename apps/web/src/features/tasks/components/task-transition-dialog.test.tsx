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

  it('не закрывается кликом мимо и не показывает угловой крестик (#511)', async () => {
    const onClose = vi.fn();
    render(
      <TransitionDialog
        transition={TRANSITION}
        onClose={onClose}
        onExecute={vi.fn()}
        executing={false}
        gate={GATE}
      />,
    );

    const reason = screen.getByLabelText('Причина (попадёт в историю)') as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: 'Согласовано с заказчиком' } });
    // Radix вешает pointerdown-слушатель на document асинхронно (setTimeout 0).
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
    fireEvent.click(document.body);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(reason.value).toBe('Согласовано с заказчиком');
    expect(screen.queryByText('Close')).toBeNull();
  });

  it('закрывается по Esc', () => {
    const onClose = vi.fn();
    render(
      <TransitionDialog
        transition={TRANSITION}
        onClose={onClose}
        onExecute={vi.fn()}
        executing={false}
        gate={GATE}
      />,
    );

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalled();
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

    fireEvent.click(screen.getByTitle('Открыть подзадачу'));
    expect(onOpenSubtask).toHaveBeenCalledWith(SUBTASK.id);
  });
});
