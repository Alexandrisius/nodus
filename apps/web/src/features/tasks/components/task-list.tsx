import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useShellStore } from '../../../app/shell/shell-store.js';
import { ColumnResizer } from '../../../shared/views/column-resizer.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { useTasksPages } from '../api/tasks-api.js';
import { taskListFields } from '../lib/task-fields.js';
import { buildTaskRows, filterVisibleRows, type TaskRow } from '../lib/task-tree.js';
import { graphWidth, graphX, TaskListTree } from './task-list-graph.js';

/**
 * Список задач (вид «Список»): иерархия со сворачиванием веток, как папки в
 * проводнике. Граф вложенности — единый SVG-оверлей (непрерывные рёбра без
 * зазоров, каскадное построение при раскрытии, ширина колонки растёт с
 * глубиной). Таблица — модель Битрикса: все колонки фиксированной ширины
 * (без fr-компенсации — ручка ресайза следует за курсором 1:1, соседние
 * колонки не «уезжают»), ширина таблицы — по содержимому, при переполнении —
 * горизонтальный скролл. Настройки — шестерёнка в шапке страницы, ширина —
 * ручкой на грани хедера, с памятью между сессиями.
 */
export function TaskList() {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useTasksPages();
  const navigate = useNavigate();
  const setLastSource = useShellStore((s) => s.setLastSource);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  /** Каскадное построение графа: база = индекс первой раскрытой строки,
   *  key перезапускает draw-on только нового раскрытия. */
  const [reveal, setReveal] = useState({ base: 0, key: 1 });
  const { visibleFields, setWidth } = useViewFields('tasks.list', taskListFields);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const rows = useMemo(() => buildTaskRows(items), [items]);
  const visible = useMemo(() => filterVisibleRows(rows, collapsed), [rows, collapsed]);

  // Бесконечная подгрузка страниц: sentinel у дна скролл-контейнера таблицы
  // (IntersectionObserver с root=контейнер), как в битриксовском журнале.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const gridTemplateColumns = useMemo(() => {
    const maxDepth = visible.reduce((max, row) => Math.max(max, row.depth), 0);
    return `${graphWidth(maxDepth)}px ${visibleFields.map((f) => `${f.width ?? 120}px`).join(' ')}`;
  }, [visibleFields, visible]);

  function toggleBranch(taskId: string) {
    const expanding = collapsed.has(taskId);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
    if (expanding) {
      const parentIndex = visible.findIndex((row) => row.task.id === taskId);
      setReveal((prev) => ({ base: parentIndex + 1, key: prev.key + 1 }));
    } else {
      setReveal((prev) => ({ base: Number.MAX_SAFE_INTEGER, key: prev.key + 1 }));
    }
  }

  /** Автоподбор ширины по контенту (двойной клик на ручке, как в Excel):
   * суммирует контентные ширины детей ячеек колонки (scrollWidth самой
   * ячейки не подходит — он не меньше её текущей ширины) + дыхание. */
  function autoFitColumn(fieldIndex: number, fieldId: string, minWidth: number, maxWidth: number) {
    const container = containerRef.current;
    if (!container) return;
    const CELL_GAP = 8;
    let max = 0;
    for (const row of container.children) {
      const cell = row.children[fieldIndex + 1] as HTMLElement | undefined;
      if (!cell) continue;
      let content = 0;
      for (const child of cell.children) {
        content += (child as HTMLElement).scrollWidth;
      }
      content += Math.max(0, cell.children.length - 1) * CELL_GAP;
      max = Math.max(max, content);
    }
    if (max > 0) {
      setWidth(fieldId, Math.min(maxWidth, Math.max(minWidth, Math.ceil(max) + 24)));
    }
  }

  function openTask(row: TaskRow, rowEl: HTMLElement) {
    const rect = rowEl.getBoundingClientRect();
    setLastSource({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
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
    <div ref={containerRef} className="h-full overflow-auto">
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
                maxWidth={field.maxWidth ?? 640}
                onResize={(w) => setWidth(field.id, w)}
                onAutoFit={() =>
                  autoFitColumn(index, field.id, field.minWidth ?? 48, field.maxWidth ?? 640)
                }
              />
            ) : null}
          </span>
        ))}
      </div>
      <div className="relative">
        {visible.map((row) => {
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
              <div className="relative">
                {row.hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBranch(task.id);
                    }}
                    aria-expanded={!branchCollapsed}
                    aria-label={branchCollapsed ? ui.tasks.expandBranch : ui.tasks.collapseBranch}
                    className="absolute top-1/2 -translate-y-1/2 cursor-pointer text-port/70 transition-colors duration-200 group-hover/row:text-port hover:text-port"
                    style={{ left: graphX(row.depth) - 9 }}
                  >
                    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
                      <circle
                        cx={9}
                        cy={9}
                        r={7}
                        fill="var(--card)"
                        stroke="currentColor"
                        strokeWidth={1}
                      />
                      <path
                        d={branchCollapsed ? 'M6,9 L12,9 M9,6 L9,12' : 'M6,9 L12,9'}
                        stroke="currentColor"
                        strokeWidth={1.25}
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
              {visibleFields.map((field) => (
                <span key={field.id} className="flex min-w-0 items-center gap-2 overflow-hidden">
                  {field.render(task, { branchCollapsed, childCount: row.childCount })}
                </span>
              ))}
            </div>
          );
        })}
        <TaskListTree
          rows={visible}
          width={graphWidth(visible.reduce((max, row) => Math.max(max, row.depth), 0))}
          revealBase={reveal.base}
          revealKey={reveal.key}
        />
      </div>
      {hasNextPage ? (
        <div ref={sentinelRef} className="flex justify-center py-3">
          <Skeleton className="h-8 w-48" />
        </div>
      ) : null}
    </div>
  );
}
