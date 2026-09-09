import type { TaskListItem, TaskStage } from '@nodus/contracts';

/**
 * Борд канбана — плоский список задач: колонка = стадия, порядок внутри
 * колонки = порядок массива (persistится индексом в DTO переноса).
 * Чистые функции перестановок — для живой сортировки drag'ом и тестов.
 */

/** Позиция задачи внутри её колонки. */
export function indexOfInStage(items: TaskListItem[], taskId: string): number {
  const task = items.find((t) => t.id === taskId);
  if (!task) return -1;
  return items.filter((t) => t.stage.id === task.stage.id).findIndex((t) => t.id === taskId);
}

/** Перенос задачи в стадию на позицию index (живой перенос между колонками
 * и финализация дропа): задача вынимается, меняет стадию и встаёт перед
 * якорем колонки либо в конец колонки. */
export function moveTaskToStage(
  items: TaskListItem[],
  taskId: string,
  stage: TaskStage,
  index: number,
): TaskListItem[] {
  const task = items.find((t) => t.id === taskId);
  if (!task) return items;
  const moved: TaskListItem = { ...task, stage };
  const rest = items.filter((t) => t.id !== taskId);
  const column = rest.filter((t) => t.stage.id === stage.id);
  const anchor = column[index];
  if (anchor) {
    const at = rest.indexOf(anchor);
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  if (column.length > 0) {
    const last = column[column.length - 1];
    if (last) {
      const at = rest.indexOf(last) + 1;
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    }
  }
  return [...rest, moved];
}

/** Перестановка внутри колонки (финиш drag над другой карточкой той же колонки). */
export function reorderWithinStage(
  items: TaskListItem[],
  activeId: string,
  overId: string,
): TaskListItem[] {
  const a = items.findIndex((t) => t.id === activeId);
  const o = items.findIndex((t) => t.id === overId);
  if (a < 0 || o < 0 || a === o) return items;
  if (items[a]?.stage.id !== items[o]?.stage.id) return items;
  const next = [...items];
  const [moved] = next.splice(a, 1);
  if (!moved) return items;
  next.splice(o, 0, moved);
  return next;
}
