import type { TaskListItem } from '@nodus/contracts';

/** Строка дерева задач: узел + геометрия его связей в графе вложенности. */
export interface TaskRow {
  task: TaskListItem;
  depth: number;
  /** Уровни сквозных вертикалей предков, проходящих строку насквозь. */
  passThrough: number[];
  /** Уровень предка, от которого идёт локоть к порту (null у корней). */
  elbowFrom: number | null;
  /** Последний среди сиблингов: вертикаль предка заканчивается этим локтем. */
  isLast: boolean;
  /** Есть дети: от порта вниз уходит вертикаль ветки. */
  hasChildren: boolean;
  /** Всего потомков (для счётчика свёрнутой ветки). */
  childCount: number;
}

/**
 * Дерево задач в плоский список (DFS): корни — в исходном порядке, дети —
 * сразу за родителем. Задача с parentId за пределами выборки считается
 * корнем. Геометрия связей — по правилам tree-графа: сквозная вертикаль
 * уровня живёт, пока у её предка ниже есть узлы.
 */
export function buildTaskRows(items: TaskListItem[]): TaskRow[] {
  const ids = new Set(items.map((t) => t.id));
  const childrenOf = new Map<string | null, TaskListItem[]>();
  for (const task of items) {
    const parent = task.parentId && ids.has(task.parentId) ? task.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(task);
    childrenOf.set(parent, list);
  }

  const rows: TaskRow[] = [];
  const walk = (nodes: TaskListItem[], depth: number, ancestorIsLast: boolean[]): number => {
    let total = 0;
    nodes.forEach((task, index) => {
      const isLast = index === nodes.length - 1;
      const children = childrenOf.get(task.id) ?? [];
      const passThrough: number[] = [];
      // Сквозная вертикаль уровня d принадлежит ветке предка d+1: она живёт,
      // пока у этого предка ниже есть сиблинги (он не последний).
      for (let d = 0; d <= depth - 2; d += 1) {
        if (ancestorIsLast[d + 1] === false) passThrough.push(d);
      }
      const row: TaskRow = {
        task,
        depth,
        passThrough,
        elbowFrom: depth > 0 ? depth - 1 : null,
        isLast,
        hasChildren: children.length > 0,
        childCount: 0,
      };
      rows.push(row);
      const descendants = walk(children, depth + 1, [...ancestorIsLast, isLast]);
      row.childCount = descendants;
      total += 1 + descendants;
    });
    return total;
  };
  walk(childrenOf.get(null) ?? [], 0, []);
  return rows;
}

/** Видимые строки с учётом свёрнутых веток: узел скрыт, если свёрнут любой
 * предок; геометрия связей не меняется (локти считаются по полному дереву). */
export function filterVisibleRows(rows: TaskRow[], collapsed: ReadonlySet<string>): TaskRow[] {
  const visible: TaskRow[] = [];
  const hiddenBelow: number[] = [];
  for (const row of rows) {
    while (hiddenBelow.length > 0 && row.depth <= (hiddenBelow[hiddenBelow.length - 1] ?? 0)) {
      hiddenBelow.pop();
    }
    if (hiddenBelow.length > 0) continue;
    visible.push(row);
    if (row.hasChildren && collapsed.has(row.task.id)) hiddenBelow.push(row.depth);
  }
  return visible;
}
