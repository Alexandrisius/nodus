import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { ui } from '@nodus/contracts';

import { ColumnResizer } from './column-resizer.js';
import { useViewFields, type FieldDef } from './use-view-fields.js';

/** Колонка канонической таблицы: поле реестра + рендер ячейки. */
export interface DataTableField<T> extends FieldDef {
  render: (row: T) => ReactNode;
}

/**
 * Таблица-канон (модель AG Grid/Битрикса, references/views-customization.md) —
 * общая машина всех журналов/списков портала (потребители: журнал писем,
 * список проектов, задачи проекта, сотрудники):
 * — ВСЕ колонки — фиксированные px-треки (fr запрещён: резиновая колонка
 *   компенсирует дельту ресайза — ручка отрывается от курсора, gotchas);
 * — единый grid на хедер и строки, w-max min-w-full: пустое место справа,
 *   переполнение — горизонтальный скролл;
 * — ресайз ручкой на грани хедера (min под контент, max 640, 1:1 за курсором),
 *   dblclick — автоподбор по контенту (сумма scrollWidth ДЕТЕЙ ячеек);
 * — видимость/ширина колонок — шестерёнка ViewSettings того же viewKey,
 *   пресет переживает reload (nodus-views-v1);
 * — строка — role=button + Enter/Space (вложенных кнопок в кнопке нет:
 *   ячейка действий — span со stopPropagation);
 * — опциональная бесконечная подгрузка sentinel-ом (IntersectionObserver,
 *   root — скролл-контейнер таблицы).
 */
export function DataTable<T>({
  viewKey,
  defs,
  rows,
  rowKey,
  onOpenRow,
  onHoverRow,
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  actions,
  emptyTitle = ui.common.empty,
}: {
  viewKey: string;
  defs: DataTableField<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Клик/Enter по строке: фича прокидывает rect источника в lastSource
   * (shared-element раскрытие слайдера) и навигирует. */
  onOpenRow: (row: T, rowEl: HTMLElement) => void;
  onHoverRow?: (row: T) => void;
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  /** Ячейка действий строки (доп. auto-колонка; клики не всплывают до строки). */
  actions?: (row: T) => ReactNode;
  emptyTitle?: string;
}) {
  const { visibleFields, setWidth } = useViewFields(viewKey, defs);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root || !hasNextPage || isFetchingNextPage || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  const gridTemplateColumns = useMemo(() => {
    const tracks = visibleFields.map((f) => `${f.width ?? 120}px`);
    if (actions) tracks.push('auto');
    return tracks.join(' ');
  }, [visibleFields, actions]);

  /** Автоподбор ширины по контенту (двойной клик на ручке, как в Excel):
   * суммирует контентные ширины детей ячеек колонки (scrollWidth самой
   * ячейки не подходит — он не меньше её текущей ширины) + дыхание. */
  function autoFitColumn(fieldIndex: number, fieldId: string, minWidth: number, maxWidth: number) {
    const container = containerRef.current;
    if (!container) return;
    const CELL_GAP = 8;
    let max = 0;
    for (const row of container.children) {
      const cell = row.children[fieldIndex] as HTMLElement | undefined;
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
        </Empty>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div
        className="sticky top-0 z-10 grid w-max min-w-full items-center gap-3 border-b border-border bg-card px-4 py-2"
        style={{ gridTemplateColumns }}
      >
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
        {actions ? <span /> : null}
      </div>
      {rows.map((row) => (
        <div
          key={rowKey(row)}
          role="button"
          tabIndex={0}
          onClick={(e) => onOpenRow(row, e.currentTarget)}
          onPointerEnter={() => onHoverRow?.(row)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenRow(row, e.currentTarget);
            }
          }}
          className="grid h-12 w-max min-w-full cursor-pointer items-stretch gap-3 border-b border-border/60 px-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
          style={{ gridTemplateColumns }}
        >
          {visibleFields.map((field) => (
            <span key={field.id} className="flex min-w-0 items-center gap-2 overflow-hidden">
              {field.render(row)}
            </span>
          ))}
          {actions ? (
            <span
              className="flex items-center"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {actions(row)}
            </span>
          ) : null}
        </div>
      ))}
      {hasNextPage ? (
        <div ref={sentinelRef} className="flex justify-center py-3">
          {isFetchingNextPage ? <Skeleton className="h-8 w-48" /> : <span className="h-1" />}
        </div>
      ) : null}
    </div>
  );
}
