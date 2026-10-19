import type { TaskListItem } from '@nodus/contracts';

import type { BoardAxis } from './kanban-board.js';

/**
 * Точечная пересборка борда (#322): свежие первые страницы части колонок
 * заменяют только эти колонки. Остальные колонки сохраняют догруженные
 * sentinel-ом страницы и порядок. Задача из свежей страницы удаляется из
 * прежнего места, даже если та колонка не обновлялась (переехала, а её
 * старая колонка не перезапрашивалась): дублей карточки на борде нет.
 * Порядок внутри колонки — порядок фида; межколоночный порядок плоского
 * массива значения не имеет (колонка собирается фильтром по оси).
 */
export function mergeRefreshedColumns(
  prev: readonly TaskListItem[],
  fresh: ReadonlyMap<string, readonly TaskListItem[]>,
  axis: BoardAxis,
): TaskListItem[] {
  const freshIds = new Set<string>();
  for (const items of fresh.values()) for (const t of items) freshIds.add(t.id);
  const kept = prev.filter((t) => {
    const column = axis.keyOf(t);
    return !(column !== null && fresh.has(column)) && !freshIds.has(t.id);
  });
  return [...kept, ...[...fresh.values()].flat()];
}
