import type { ReactNode } from 'react';
import type { TaskListItem, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDateTime, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { TaskStatusBadge } from '../../../shared/ui/task-status-badge.js';
import type { DataTableField } from '../../../shared/views/data-table.js';
import type { FieldDef } from '../../../shared/views/use-view-fields.js';

const monoCell = 'font-mono text-[11px] text-muted-foreground tabular-nums';

function personCell(user: UserRef | null): ReactNode {
  if (!user) return <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>;
  return (
    <>
      <PersonAvatar name={user.displayName} className="size-6 shrink-0" />
      <span className="truncate">{user.displayName}</span>
    </>
  );
}

/**
 * Реестр колонок списка задач проекта (ключ вида `projects.tasks` — своя
 * память колонок, отдельно от журнала задач `tasks.list`). Плоский список:
 * граф-дерево подзадач не рендерится (иерархия — в навигаторе ветки карточки
 * задачи, плейбук §3.3). Колонка «Проект» отсутствует — контекст очевиден.
 */
export const projectTaskListFields: DataTableField<TaskListItem>[] = [
  {
    id: 'number',
    label: ui.tasks.fieldNumber,
    defaultVisible: true,
    defaultWidth: 56,
    minWidth: 48,
    maxWidth: 96,
    render: (task) => <span className={monoCell}>{task.number}</span>,
  },
  {
    id: 'title',
    label: ui.tasks.fieldTitle,
    defaultVisible: true,
    defaultWidth: 340,
    minWidth: 160,
    maxWidth: 640,
    locked: true,
    render: (task) => <span className="truncate text-sm font-medium">{task.title}</span>,
  },
  {
    id: 'stage',
    label: ui.tasks.fieldStage,
    defaultVisible: true,
    defaultWidth: 128,
    minWidth: 116,
    render: (task) => <TaskStatusBadge stage={task.stage} />,
  },
  {
    id: 'deadline',
    label: ui.tasks.deadline,
    defaultVisible: true,
    defaultWidth: 172,
    minWidth: 140,
    render: (task) => <DeadlineChip deadline={task.deadline} />,
  },
  {
    id: 'assignee',
    label: ui.tasks.assignee,
    defaultVisible: true,
    defaultWidth: 160,
    minWidth: 110,
    render: (task) => personCell(task.assignee),
  },
  {
    id: 'creator',
    label: ui.tasks.creator,
    defaultVisible: false,
    defaultWidth: 160,
    minWidth: 110,
    render: (task) => personCell(task.creator),
  },
  {
    id: 'comments',
    label: ui.tasks.colComments,
    defaultVisible: true,
    defaultWidth: 60,
    minWidth: 48,
    render: (task) => <span className={monoCell}>{task.commentsCount}</span>,
  },
  {
    id: 'spent',
    label: ui.tasks.colSpent,
    defaultVisible: true,
    defaultWidth: 72,
    minWidth: 56,
    render: (task) => (
      <span className={monoCell}>
        {task.spentMinutes > 0 ? formatMinutes(task.spentMinutes) : '—'}
      </span>
    ),
  },
  {
    id: 'updated',
    label: ui.tasks.fieldUpdated,
    defaultVisible: false,
    defaultWidth: 140,
    minWidth: 112,
    render: (task) => <span className={monoCell}>{formatDateTime(task.updatedAt)}</span>,
  },
];

/**
 * Реестр блоков карточки проектного канбана (ключ вида `projects.kanban`;
 * id — те же, что читает общая BoardTaskCard). «Проект» по умолчанию скрыт:
 * доска открыта внутри карточки проекта.
 */
export const projectKanbanCardFields: FieldDef[] = [
  { id: 'parent', label: ui.tasks.subtaskOf, defaultVisible: true },
  { id: 'number', label: ui.tasks.fieldNumber, defaultVisible: true },
  { id: 'source', label: ui.tasks.fieldSource, defaultVisible: true },
  { id: 'deadline', label: ui.tasks.deadline, defaultVisible: true },
  { id: 'project', label: ui.tasks.project, defaultVisible: false },
  { id: 'assignee', label: ui.tasks.assignee, defaultVisible: true },
  { id: 'comments', label: ui.tasks.comments, defaultVisible: true },
  { id: 'spent', label: ui.tasks.colSpent, defaultVisible: true },
];
