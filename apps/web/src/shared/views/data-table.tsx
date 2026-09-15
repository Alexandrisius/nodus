import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { ui } from '@nodus/contracts';

import { DataTableHeader } from './data-table-header.js';
import { LEADING_COL_W, RowMenu, type RowMenuItem } from './row-menu.js';
import { sortRows } from './sort-rows.js';
import { useRowSelection } from './use-row-selection.js';
import { useViewFields, type FieldDef } from './use-view-fields.js';
import { cn } from '@nodus/ui/lib/utils';

/** Колонка канонической таблицы: поле реестра + рендер ячейки. */
export interface DataTableField<T> extends FieldDef {
  render: (row: T) => ReactNode;
  /** Значение для сортировки (концепт #4): задано → заголовок кликабелен
   *  (↑/↓); на бэке id поля = имя параметра `?sort=field:dir`. */
  sortValue?: (row: T) => string | number | null;
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
 * — ПОРЯДОК колонок — dnd за заголовок (живой черновик: колонка едет целиком,
 *   коммит на drop), СОРТИРОВКА — клик по заголовку ↑/↓ (одна колонка,
 *   стабильная: тай-брейк по rowKey); обе — в пресет вида (концепт #4);
 * — строка — role=button + Enter/Space (вложенных кнопок в кнопке нет:
 *   ячейка действий — span со stopPropagation);
 * — ВЕДУЩАЯ колонка (вердикт владельца 15.09.2026, модель Битрикс24):
 *   чекбокс множественного выбора (хедер — «выбрать все» с indeterminate,
 *   выбранная строка — тон accent) + «шашка» контекстного меню строки
 *   (только реальные действия); не ресайзится и не прячется шестерёнкой;
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
  rowMenu,
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
  /** Пункты контекстного меню строки («шашка» в ведущей ячейке). */
  rowMenu?: (row: T) => RowMenuItem[];
  emptyTitle?: string;
}) {
  const { fields, visibleFields, sort, setWidth, setOrder, cycleSort } = useViewFields(
    viewKey,
    defs,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Сортировка строк (клиентская, концепт #4; ?sort= на бэке — отдельный
  // issue): стабильная, null — в конец (sort-rows).
  const sortedRows = useMemo(() => sortRows(rows, sort, defs, rowKey), [rows, sort, defs, rowKey]);

  const rowKeys = useMemo(() => sortedRows.map(rowKey), [sortedRows, rowKey]);
  const { selected, toggle, toggleAll, headerChecked } = useRowSelection(rowKeys);

  /** Коммит порядка на отпускании drag: видимые в новом + скрытые следом
   *  (их место сохраняется), видимость передаётся ТЕКУЩАЯ — applyOrder её
   *  не насилует (урок воскресающих скрытых полей, view-store). */
  const commitOrder = (ids: string[]) =>
    setOrder(
      [...ids, ...fields.filter((f) => !f.visible).map((f) => f.id)].map((id) => ({
        id,
        visible: fields.find((f) => f.id === id)?.visible ?? true,
      })),
    );

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
    const tracks = [`${LEADING_COL_W}px`, ...visibleFields.map((f) => `${f.width ?? 120}px`)];
    if (actions) tracks.push('auto');
    return tracks.join(' ');
  }, [visibleFields, actions]);

  /** Автоподбор ширины по контенту (двойной клик на ручке, как в Excel):
   * суммирует контентные ширины детей ячеек колонки (scrollWidth самой
   * ячейки не подходит — он не меньше её текущей ширины) + дыхание.
   * Индекс сдвинут на ведущую колонку (выбор + меню). */
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
      <DataTableHeader
        fields={visibleFields}
        sort={sort}
        headerChecked={headerChecked}
        hasActions={actions !== undefined}
        style={{ gridTemplateColumns }}
        onToggleAll={toggleAll}
        onResize={(fieldId, w) => setWidth(fieldId, w)}
        onAutoFit={autoFitColumn}
        onCycleSort={cycleSort}
        onReorder={commitOrder}
      />
      {sortedRows.map((row) => {
        const key = rowKey(row);
        const isSelected = selected.has(key);
        return (
          <div
            key={key}
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
            className={cn(
              'grid h-12 w-max min-w-full cursor-pointer items-stretch gap-3 border-b border-border/60 px-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring',
              isSelected && 'bg-accent/50',
            )}
            style={{ gridTemplateColumns }}
          >
            {/* Ведущая ячейка: чекбокс выбора + «шашка» меню (клики не
              всплывают до строки — открытие карточки не срабатывает). */}
            <span
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggle(key)}
                aria-label={ui.common.selectRow}
              />
              <RowMenu items={rowMenu?.(row) ?? []} />
            </span>
            {visibleFields.map((field) => (
              <span
                key={field.id}
                data-cell-field={field.id}
                className="flex min-w-0 items-center gap-2 overflow-hidden"
              >
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
        );
      })}
      {hasNextPage ? (
        <div ref={sentinelRef} className="flex justify-center py-3">
          {isFetchingNextPage ? <Skeleton className="h-8 w-48" /> : <span className="h-1" />}
        </div>
      ) : null}
    </div>
  );
}
