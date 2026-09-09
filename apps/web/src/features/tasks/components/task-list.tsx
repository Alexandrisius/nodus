import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useShellStore } from '../../../app/shell/shell-store.js';
import { ColumnResizer } from '../../../shared/views/column-resizer.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { useTasksList } from '../api/tasks-api.js';
import { taskListFields } from '../lib/task-fields.js';
import { buildTaskRows, filterVisibleRows, type TaskRow } from '../lib/task-tree.js';
import { GRAPH_X, TaskListGraph } from './task-list-graph.js';

/** Ширина колонки графа (фиксированная, не настраивается). */
const GRAPH_COL = 54;

/**
 * Список задач (вид «Список»): иерархия со сворачиванием веток, как папки в
 * проводнике. Таблица — модель Битрикса: все колонки фиксированной ширины
 * (без fr-компенсации — ручка ресайза следует за курсором 1:1, соседние
 * колонки не «уезжают»), ширина таблицы — по содержимому, при переполнении —
 * горизонтальный скролл. Настройки — шестерёнка в шапке страницы, ширина —
 * ручкой на грани хедера, с памятью между сессиями.
 */
export function TaskList() {
  const { data, isLoading } = useTasksList();
  const navigate = useNavigate();
  const setLastDock = useShellStore((s) => s.setLastDock);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const { visibleFields, setWidth } = useViewFields('tasks.list', taskListFields);

  const rows = useMemo(() => buildTaskRows(data?.items ?? []), [data]);
  const visible = useMemo(() => filterVisibleRows(rows, collapsed), [rows, collapsed]);

  const gridTemplateColumns = useMemo(
    () => `${GRAPH_COL}px ${visibleFields.map((f) => `${f.width ?? 120}px`).join(' ')}`,
    [visibleFields],
  );

  function toggleBranch(taskId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function openTask(row: TaskRow, rowEl: HTMLElement) {
    const rect = rowEl.getBoundingClientRect();
    setLastDock({
      x: rect.left + GRAPH_X(row.depth),
      y: rect.top + rect.height / 2,
    });
    void navigate({
      to: '/tasks/$taskId',
      params: { taskId: row.task.id },
      search: { view: 'list' },
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
    <div className="h-full overflow-auto">
      <div
        className="sticky top-0 z-10 grid w-max min-w-full items-center gap-3 border-b border-border bg-background px-4 py-2"
        style={{ gridTemplateColumns }}
      >
        <span />
        {visibleFields.map((field, index) => (
          <span key={field.id} className="relative flex min-w-0 items-center">
            <NodeLabel label={field.label} className="truncate" />
            {field.width !== undefined && index < visibleFields.length - 1 ? (
              <ColumnResizer
                width={field.width}
                minWidth={field.minWidth ?? 48}
                onResize={(w) => setWidth(field.id, w)}
              />
            ) : null}
          </span>
        ))}
      </div>
      {visible.map((row, index) => {
        const { task } = row;
        const branchCollapsed = collapsed.has(task.id);
        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={(e) => openTask(row, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openTask(row, e.currentTarget);
              }
            }}
            className="group/row grid h-12 w-max min-w-full cursor-pointer items-stretch gap-3 border-b border-border/60 px-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
            style={{ gridTemplateColumns }}
          >
            {row.hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBranch(task.id);
                }}
                aria-expanded={!branchCollapsed}
                aria-label={branchCollapsed ? ui.tasks.expandBranch : ui.tasks.collapseBranch}
                className="cursor-pointer"
              >
                <TaskListGraph row={row} index={index} branchCollapsed={branchCollapsed} />
              </button>
            ) : (
              <div>
                <TaskListGraph row={row} index={index} branchCollapsed={false} />
              </div>
            )}
            {visibleFields.map((field) => (
              <span key={field.id} className="flex min-w-0 items-center gap-2">
                {field.render(task, { branchCollapsed, childCount: row.childCount })}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
