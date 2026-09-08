import { useMemo } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { useShellStore } from '../../../app/shell/shell-store.js';
import { useTasksList } from '../api/tasks-api.js';
import { buildTaskRows } from '../lib/task-tree.js';
import { GRAPH_X, TaskListGraph } from './task-list-graph.js';
import { TaskStatusBadge } from './task-status-badge.js';

const GRID = 'grid grid-cols-[54px_56px_minmax(0,1fr)_170px_160px_52px_64px] items-center gap-3';

/**
 * Список задач (вид «Список»): таблица с графом вложенности слева —
 * уровни подзадач читаются как плата со связями; клик открывает карточку
 * слайдером, стыкованным ребром от порта строки.
 */
export function TaskList() {
  const { data, isLoading } = useTasksList();
  const navigate = useNavigate();
  const setLastDock = useShellStore((s) => s.setLastDock);
  const rows = useMemo(() => buildTaskRows(data?.items ?? []), [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className={`${GRID} sticky top-0 z-10 border-b border-border bg-background px-4 py-2`}>
        <span />
        <NodeLabel label="№" />
        <NodeLabel label={ui.tasks.title} />
        <NodeLabel label={ui.tasks.deadline} />
        <NodeLabel label={ui.tasks.assignee} />
        <NodeLabel label={ui.tasks.colComments} />
        <NodeLabel label={ui.tasks.colSpent} />
      </div>
      {rows.map((row, index) => {
        const { task } = row;
        return (
          <button
            key={task.id}
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setLastDock({
                x: rect.left + GRAPH_X(row.depth),
                y: rect.top + rect.height / 2,
              });
              void navigate({ to: '/tasks/$taskId', params: { taskId: task.id } });
            }}
            className={`${GRID} group/row h-12 w-full border-b border-border/60 px-4 text-left transition-colors last:border-b-0 hover:bg-accent/40`}
          >
            <TaskListGraph row={row} index={index} />
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {task.number}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {task.source === 'letter' ? (
                <Mail className="size-3.5 shrink-0 text-info/70" aria-label={ui.tasks.fromLetter} />
              ) : null}
              {task.source === 'chat_message' ? (
                <MessageSquare
                  className="size-3.5 shrink-0 text-info/70"
                  aria-label={ui.tasks.fromChat}
                />
              ) : null}
              <span className="truncate text-sm font-medium">{task.title}</span>
              <TaskStatusBadge stage={task.stage} />
            </span>
            <DeadlineChip deadline={task.deadline} />
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {task.assignee ? (
                <>
                  <PersonAvatar name={task.assignee.displayName} className="size-6 shrink-0" />
                  <span className="truncate">{task.assignee.displayName}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>
              )}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {task.commentsCount}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {task.spentMinutes > 0 ? formatMinutes(task.spentMinutes) : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
