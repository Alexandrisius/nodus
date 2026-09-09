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
import { buildTaskRows, filterVisibleRows } from '../lib/task-tree.js';
import { GRAPH_X, TaskListGraph } from './task-list-graph.js';

/**
 * Список задач (вид «Список»): иерархия со сворачиванием веток, как папки в
 * проводнике; колонки — настраиваемые (шестерёнка в шапке страницы: поля и
 * их порядок видимости; ширина — ручкой на грани хедера, с памятью между
 * сессиями). Клик по строке открывает карточку слайдером от её порта.
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
    () => visibleFields.map((f) => (f.flex ? 'minmax(0,1fr)' : `${f.width ?? 120}px`)).join(' '),
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
        <div className="grid flex-1 items-center gap-3" style={{ gridTemplateColumns }}>
          {visibleFields.map((field) => (
            <span key={field.id} className="relative flex min-w-0 items-center">
              <NodeLabel label={field.label} className="truncate" />
              {!field.flex && field.width !== undefined ? (
                <ColumnResizer
                  width={field.width}
                  minWidth={field.minWidth ?? 48}
                  onResize={(w) => setWidth(field.id, w)}
                />
              ) : null}
            </span>
          ))}
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
              className="grid flex-1 items-center gap-3 text-left"
              style={{ gridTemplateColumns }}
            >
              {visibleFields.map((field) => (
                <span key={field.id} className="flex min-w-0 items-center gap-2">
                  {field.render(task, {
                    branchCollapsed,
                    childCount: row.childCount,
                  })}
                </span>
              ))}
            </button>
          </div>
        );
      })}
    </div>
  );
}
