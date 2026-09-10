import type { TaskListItem, TaskStage } from '@nodus/contracts';

/**
 * Борд канбана — плоский список задач: колонка = стадия, порядок внутри
 * колонки = порядок массива (persistится индексом в DTO переноса).
 * Чистые функции перестановок — для живой сортировки drag'ом и тестов.
 *
 * Ось борда (ADR-0008): глобальная (стадия workflow-схемы — степпер, проектная
 * доска) или личная (personalStageId — «Мой план»). Функции работают с осью
 * через стратегию keyOf/withStage и не знают, какая ось у конкретного борда.
 */
export interface BoardAxis {
  keyOf: (task: TaskListItem) => string | null;
  withStage: (task: TaskListItem, stage: TaskStage) => TaskListItem;
}

export const globalAxis: BoardAxis = {
  keyOf: (t) => t.stage.id,
  withStage: (t, stage) => ({ ...t, stage }),
};

export const personalAxis: BoardAxis = {
  keyOf: (t) => t.personalStageId,
  withStage: (t, stage) => ({ ...t, personalStageId: stage.id }),
};

/** Позиция задачи внутри её колонки. */
export function indexOfInStage(items: TaskListItem[], taskId: string, axis: BoardAxis): number {
  const task = items.find((t) => t.id === taskId);
  if (!task) return -1;
  const key = axis.keyOf(task);
  return items.filter((t) => axis.keyOf(t) === key).findIndex((t) => t.id === taskId);
}

/** Перенос задачи в стадию на позицию index (живой перенос между колонками
 * и финализация дропа): задача вынимается, меняет стадию по оси и встаёт
 * перед якорем колонки либо в конец колонки. */
export function moveTaskToStage(
  items: TaskListItem[],
  taskId: string,
  stage: TaskStage,
  index: number,
  axis: BoardAxis,
): TaskListItem[] {
  const task = items.find((t) => t.id === taskId);
  if (!task) return items;
  const moved: TaskListItem = axis.withStage(task, stage);
  const rest = items.filter((t) => t.id !== taskId);
  const column = rest.filter((t) => axis.keyOf(t) === stage.id);
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

/** Одинаковый ли порядок задач (по id) — предохранитель холостых setState:
 * идентичный результат перестановки не должен создавать новое состояние
 * (пустые витки измерение→onDragOver→setState — топливо цикла update depth). */
export function isSameOrder(a: TaskListItem[], b: TaskListItem[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i]?.id);
}

/** Перестановка внутри колонки (финиш drag над другой карточкой той же колонки). */
export function reorderWithinStage(
  items: TaskListItem[],
  activeId: string,
  overId: string,
  axis: BoardAxis,
): TaskListItem[] {
  const a = items.findIndex((t) => t.id === activeId);
  const o = items.findIndex((t) => t.id === overId);
  if (a < 0 || o < 0 || a === o) return items;
  const aTask = items[a];
  const oTask = items[o];
  if (!aTask || !oTask || axis.keyOf(aTask) !== axis.keyOf(oTask)) return items;
  const next = [...items];
  const [moved] = next.splice(a, 1);
  if (!moved) return items;
  next.splice(o, 0, moved);
  return next;
}
