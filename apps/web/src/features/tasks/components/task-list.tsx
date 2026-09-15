import { useMemo, useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Checkbox } from '@nodus/ui/components/checkbox';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTableHeader } from '../../../shared/views/data-table-header.js';
import { LEADING_COL_W, RowMenu, type RowMenuItem } from '../../../shared/views/row-menu.js';
import { sortRows } from '../../../shared/views/sort-rows.js';
import { useAutoFitColumn } from '../../../shared/views/use-autofit-column.js';
import { useInfiniteSentinel } from '../../../shared/views/use-infinite-sentinel.js';
import { useRowSelection } from '../../../shared/views/use-row-selection.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList } from '../../../shared/views/use-list-toolbar.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { useTasksPages, usePrefetchTask } from '../api/tasks-api.js';
import type { TaskListItem } from '@nodus/contracts';
import { taskListFields } from '../lib/task-fields.js';
import { buildTaskRows, filterVisibleRows, type TaskRow } from '../lib/task-tree.js';
import { graphWidth, graphX, TaskListTree } from './task-list-graph.js';
import { cn } from '@nodus/ui/lib/utils';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';

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
export function TaskList({ filter }: { filter?: ActiveListFilter<TaskListItem> }) {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useTasksPages();
  const openCard = useOpenCard();
  const prefetch = usePrefetchTask();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  /** Каскадное построение графа: база = индекс первой раскрытой строки,
   *  key перезапускает draw-on только нового раскрытия. */
  const [reveal, setReveal] = useState({ base: 0, key: 1 });
  const { visibleFields, sort, setWidth, cycleSort, commitOrder } = useViewFields(
    'tasks.list',
    taskListFields,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  // Локальный фильтр строки инструментов: сужает загруженное (дерево строится
  // из видимого; родитель вне фильтра отображается корнем — ограничение
  // клиентской фильтрации дерева, до серверной).
  const filtered = useFilteredList(items, filter);
  // Сортировка (концепт #4): ПЛОСКИЙ список до построения дерева — получается
  // сортировка СИБЛИНГОВ внутри веток, структура дерева не ломается.
  const sorted = useMemo(
    () => sortRows(filtered, sort, taskListFields, (t) => t.id),
    [filtered, sort],
  );
  const rows = useMemo(() => buildTaskRows(sorted), [sorted]);
  const visible = useMemo(() => filterVisibleRows(rows, collapsed), [rows, collapsed]);
  // Множественный выбор строк (модель Битрикс24, вердикт 15.09.2026):
  // та же механика, что в DataTable (useRowSelection + ведущая колонка).
  const visibleKeys = useMemo(() => visible.map((row) => row.task.id), [visible]);
  const { selected, toggle, toggleAll, headerChecked } = useRowSelection(visibleKeys);

  // Бесконечная подгрузка страниц: sentinel у дна скролл-контейнера таблицы
  // (shared-хук, модель битриксовского журнала).
  useInfiniteSentinel(containerRef, sentinelRef, {
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: fetchNextPage ? () => void fetchNextPage() : undefined,
  });

  const gridTemplateColumns = useMemo(() => {
    const maxDepth = visible.reduce((max, row) => Math.max(max, row.depth), 0);
    return `${LEADING_COL_W}px ${graphWidth(maxDepth)}px ${visibleFields.map((f) => `${f.width ?? 120}px`).join(' ')}`;
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

  /** Автоподбор ширины (двойной клик на ручке): shared-хук, сдвиг на
   *  ведущую колонку (выбор+меню) и колонку графа. */
  const autoFitColumn = useAutoFitColumn(containerRef, 2, setWidth);

  function openTask(row: TaskRow, rowEl: HTMLElement) {
    openCard({ kind: 'task', id: row.task.id }, rowEl.getBoundingClientRect());
  }

  /** Меню строки («шашка», модель Битрикс24): стандартная пара — открытие
   *  карточки и deep-link в стек (ADR-0009, shared/views/card-row-menu). */
  function taskRowMenu(row: TaskRow): RowMenuItem[] {
    return makeCardRowMenuItems({ kind: 'task', id: row.task.id }, (ref) => openCard(ref));
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
    <div
      ref={containerRef}
      role="table"
      aria-label={ui.tasks.title}
      className="h-full overflow-auto"
    >
      <DataTableHeader
        fields={visibleFields}
        sort={sort}
        headerChecked={headerChecked}
        hasActions={false}
        style={{ gridTemplateColumns }}
        afterLeading={<span />}
        onToggleAll={toggleAll}
        onResize={(fieldId, w) => setWidth(fieldId, w)}
        onAutoFit={autoFitColumn}
        onCycleSort={cycleSort}
        onReorder={commitOrder}
      />
      <div className="relative">
        {visible.map((row) => {
          const { task } = row;
          const branchCollapsed = collapsed.has(task.id);
          const isSelected = selected.has(task.id);
          return (
            <div
              key={task.id}
              role="row"
              tabIndex={0}
              onClick={(e) => openTask(row, e.currentTarget)}
              onPointerEnter={() => prefetch(task.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openTask(row, e.currentTarget);
                }
              }}
              className={cn(
                'group/row grid h-12 w-max min-w-full cursor-pointer items-stretch gap-3 border-b border-border/60 px-4 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_48px] last:border-b-0 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring',
                isSelected && 'bg-accent/50',
              )}
              style={{ gridTemplateColumns }}
            >
              {/* Ведущая ячейка (выбор + «шашка»): клики не всплывают
                  до строки — ветку/карточку не открывает. */}
              <span
                role="cell"
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(task.id)}
                  aria-label={ui.common.selectRow}
                />
                <RowMenu items={taskRowMenu(row)} />
              </span>
              <div role="cell" className="relative">
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
                <span
                  key={field.id}
                  role="cell"
                  data-cell-field={field.id}
                  className="flex min-w-0 items-center gap-2 overflow-hidden"
                >
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
