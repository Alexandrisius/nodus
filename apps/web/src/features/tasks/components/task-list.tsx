import { useMemo, useState } from 'react';
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
import { buildTaskRows, filterVisibleRows } from '../lib/task-tree.js';
import { GRAPH_X, TaskListGraph } from './task-list-graph.js';
import { TaskStatusBadge } from './task-status-badge.js';

const GRID = 'grid flex-1 grid-cols-[56px_minmax(0,1fr)_170px_160px_52px_64px] items-center gap-3';

/**
 * Список задач (вид «Список»): иерархия со сворачиванием веток, как папки в
 * проводнике — порт родителя («−»/«+») раскрывает и сворачивает подзадачи,
 * у свёрнутой ветки — счётчик скрытых. Клик по строке открывает карточку
 * слайдером, стыкованным ребром от её порта.
 */
export function TaskList() {
  const { data, isLoading } = useTasksList();
  const navigate = useNavigate();
  const setLastDock = useShellStore((s) => s.setLastDock);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo(() => buildTaskRows(data?.items ?? []), [data]);
  const visible = useMemo(() => filterVisibleRows(rows, collapsed), [rows, collapsed]);

  function toggleBranch(taskId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

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
      <div className="sticky top-0 z-10 flex border-b border-border bg-background px-4 py-2">
        <span className="w-[54px] shrink-0" />
        <div className={GRID}>
          <NodeLabel label="№" />
          <NodeLabel label={ui.tasks.title} />
          <NodeLabel label={ui.tasks.deadline} />
          <NodeLabel label={ui.tasks.assignee} />
          <NodeLabel label={ui.tasks.colComments} />
          <NodeLabel label={ui.tasks.colSpent} />
        </div>
      </div>
      {visible.map((row, index) => {
        const { task } = row;
        const branchCollapsed = collapsed.has(task.id);
        return (
          <div
            key={task.id}
            className="group/row flex h-12 items-stretch border-b border-border/60 px-4 transition-colors last:border-b-0 hover:bg-accent/40"
          >
            {row.hasChildren ? (
              <button
                type="button"
                onClick={() => toggleBranch(task.id)}
                aria-expanded={!branchCollapsed}
                aria-label={branchCollapsed ? ui.tasks.expandBranch : ui.tasks.collapseBranch}
                className="w-[54px] shrink-0 cursor-pointer"
              >
                <TaskListGraph row={row} index={index} branchCollapsed={branchCollapsed} />
              </button>
            ) : (
              <div className="w-[54px] shrink-0">
                <TaskListGraph row={row} index={index} branchCollapsed={false} />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                const rowRect = e.currentTarget.parentElement?.getBoundingClientRect();
                setLastDock({
                  x: (rowRect?.left ?? 0) + GRAPH_X(row.depth),
                  y: (rowRect?.top ?? 0) + (rowRect?.height ?? 0) / 2,
                });
                void navigate({
                  to: '/tasks/$taskId',
                  params: { taskId: task.id },
                  search: { view: 'list' },
                });
              }}
              className={`${GRID} text-left`}
            >
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {task.number}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {task.source === 'letter' ? (
                  <Mail
                    className="size-3.5 shrink-0 text-info/70"
                    aria-label={ui.tasks.fromLetter}
                  />
                ) : null}
                {task.source === 'chat_message' ? (
                  <MessageSquare
                    className="size-3.5 shrink-0 text-info/70"
                    aria-label={ui.tasks.fromChat}
                  />
                ) : null}
                <span className="truncate text-sm font-medium">{task.title}</span>
                <TaskStatusBadge stage={task.stage} />
                {branchCollapsed && row.childCount > 0 ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    +{row.childCount}
                  </span>
                ) : null}
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
          </div>
        );
      })}
    </div>
  );
}
