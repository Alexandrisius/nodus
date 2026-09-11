import type { ReactNode } from 'react';
import type { TaskListItem, TaskPriority, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { formatDateTime, formatMinutes } from '../lib/format.js';
import { DeadlineChip } from '../ui/deadline-chip.js';
import { identityTone } from '../ui/identity-tone.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { TaskStatusBadge } from '../ui/task-status-badge.js';
import type { DataTableField } from './data-table.js';

const monoCell = 'font-mono text-[11px] text-muted-foreground tabular-nums';

export const priorityTone: Record<TaskPriority, 'muted' | 'warning' | 'danger'> = {
  low: 'muted',
  normal: 'muted',
  high: 'warning',
  urgent: 'danger',
};

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
 * ЕДИНЫЙ реестр колонок плоского списка задач (стандарт владельца, раунд 3:
 * где бы ни показывались задачи — полный набор полей + настройка видимости,
 * модули не отличаются). Потребители: задачи проекта (карточка проекта),
 * задачи сотрудника (карточка сотрудника) — каждый со СВОИМ viewKey (своя
 * память колонок), но реестр один. Дерево-граф журнала задач — отдельный
 * реестр с контекстом ветки (features/tasks/lib/task-fields.tsx).
 *
 * `projectVisible` — колонка «Проект» по умолчанию: внутри карточки
 * проекта контекст очевиден (false), в остальных местах показываем (true).
 */
export function makeTaskTableFields({
  projectVisible = true,
}: { projectVisible?: boolean } = {}): DataTableField<TaskListItem>[] {
  return [
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
      id: 'project',
      label: ui.tasks.project,
      defaultVisible: projectVisible,
      defaultWidth: 180,
      minWidth: 120,
      render: (task) =>
        task.project ? (
          <>
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${identityTone[task.project.color].dot}`}
            />
            <span className="truncate font-mono text-[11px] text-info/80">{task.project.name}</span>
          </>
        ) : (
          <span className={monoCell}>—</span>
        ),
    },
    {
      id: 'priority',
      label: ui.tasks.fieldPriority,
      defaultVisible: false,
      defaultWidth: 108,
      minWidth: 92,
      render: (task) => (
        <NodeChip tone={priorityTone[task.priority]}>{ui.tasks.priority[task.priority]}</NodeChip>
      ),
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
}
