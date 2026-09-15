import type { ViewSort } from '@nodus/contracts';

/**
 * Стабильная сортировка строк списка (концепт #4, клиентская; `?sort=field:dir`
 * на бэке — отдельный issue): равные значения и null-хвост не «пляшут» —
 * тай-брейк по rowKey всегда по возрастанию, направление не влияет; null —
 * в конец при любом направлении. Для дерева (журнал задач) сортирует ПЛОСКИЙ
 * список до построения — получается сортировка сиблингов внутри веток.
 */
export function sortRows<
  T,
  F extends { id: string; sortValue?: (row: T) => string | number | null },
>(rows: T[], sort: ViewSort | undefined, defs: F[], rowKey: (row: T) => string): T[] {
  if (!sort) return rows;
  const field = defs.find((d) => d.id === sort.field);
  if (!field?.sortValue) return rows;
  const sv = field.sortValue;
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sv(a);
    const vb = sv(b);
    if (va == null && vb == null) return rowKey(a).localeCompare(rowKey(b));
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return rowKey(a).localeCompare(rowKey(b));
    return (va < vb ? -1 : 1) * mul;
  });
}
