import { useCallback, useMemo, useState } from 'react';

/** Состояние множественного выбора строк журнала (модель Битрикс24,
 *  вердикт владельца 15.09.2026): чекбокс строки + чекбокс «выбрать все»
 *  в хедере (indeterminate при частичном выборе). Выбор переживает фильтры
 *  и подгрузку страниц (ключи не сбрасываются) — групповые действия (будущее)
 *  получат стабильный набор. Потребители: DataTable и TaskList (одинаковая
 *  механика во всех списках — принцип одного прохода). */
export function useRowSelection(rowKeys: readonly string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === rowKeys.length && rowKeys.length > 0 ? new Set() : new Set(rowKeys),
    );
  }, [rowKeys]);

  /** Состояние чекбокса хедера: все / часть / ничего. */
  const headerChecked: boolean | 'indeterminate' = useMemo(() => {
    if (rowKeys.length === 0 || selected.size === 0) return false;
    const visibleSelected = rowKeys.filter((k) => selected.has(k)).length;
    if (visibleSelected === 0) return false;
    return visibleSelected === rowKeys.length ? true : 'indeterminate';
  }, [rowKeys, selected]);

  return { selected, toggle, toggleAll, headerChecked };
}
