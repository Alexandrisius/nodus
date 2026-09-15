import { useCallback, type RefObject } from 'react';

/** Автоподбор ширины колонки по контенту (двойной клик на ручке, как в
 *  Excel): суммирует контентные ширины детей ячеек колонки (scrollWidth
 *  самой ячейки не подходит — он не меньше её текущей ширины) + дыхание
 *  24px. leadingOffset — сдвиг индекса на служебные колонки слева
 *  (DataTable: 1 — ведущая; TaskList: 2 — ведущая + колонка графа).
 *  Одна механика обеих таблиц (аудит #45 — была копией). */
export function useAutoFitColumn(
  containerRef: RefObject<HTMLElement | null>,
  leadingOffset: 1 | 2,
  setWidth: (fieldId: string, width: number) => void,
) {
  return useCallback(
    (fieldIndex: number, fieldId: string, minWidth: number, maxWidth: number) => {
      const container = containerRef.current;
      if (!container) return;
      const CELL_GAP = 8;
      let max = 0;
      for (const row of container.children) {
        const cell = row.children[fieldIndex + leadingOffset] as HTMLElement | undefined;
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
    },
    [containerRef, leadingOffset, setWidth],
  );
}
