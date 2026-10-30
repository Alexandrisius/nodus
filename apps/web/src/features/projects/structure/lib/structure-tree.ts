import type { ProjectNode, ProjectNodeRollup, TaskListItem } from '@nodus/contracts';

/** Сборка дерева структуры проекта (#467) в плоские строки таблицы: узлы-
 *  папки с агрегатами поддерева, задачи-листья внутри раскрытых узлов и
 *  секция «Без узла». Чистые функции без React — паттерн task-tree.ts:
 *  построение/фильтрация тестируются юнитами, компонент только рендерит. */

/** Агрегаты поддерева: суммы ПРЯМЫХ rollup узлов поддерева (включая сам
 *  узел); nearest — MIN по открытым задачам, latest — MAX по всем. */
export type NodeSubtreeRollup = ProjectNodeRollup;

export interface StructureNodeRow {
  kind: 'node';
  node: ProjectNode;
  depth: number;
  /** Сумма rollup по поддереву (узел + потомки). */
  subtree: NodeSubtreeRollup;
  /** Есть дочерние узлы или прямые задачи (стрелка раскрытия). */
  hasChildren: boolean;
  /** Все потомки (узлы + задачи) — счётчик свёрнутой ветки «+N». */
  descendantCount: number;
}

export interface StructureTaskRow {
  kind: 'task';
  task: TaskListItem;
  /** depth = глубина узла + 1 (лист под папкой). */
  depth: number;
}

/** Заголовок секции задач вне структуры (внизу дерева). */
export interface StructureNoNodeRow {
  kind: 'noNode';
  count: number;
}

export type StructureRow = StructureNodeRow | StructureTaskRow | StructureNoNodeRow;

const EMPTY_ROLLUP: ProjectNodeRollup = {
  taskCount: 0,
  doneCount: 0,
  plannedMinutes: 0,
  spentMinutes: 0,
  nearestDeadline: null,
  latestDeadline: null,
};

function addRollup(acc: ProjectNodeRollup, part: ProjectNodeRollup): void {
  acc.taskCount += part.taskCount;
  acc.doneCount += part.doneCount;
  acc.plannedMinutes += part.plannedMinutes;
  acc.spentMinutes += part.spentMinutes;
  if (part.nearestDeadline !== null) {
    if (acc.nearestDeadline === null || part.nearestDeadline < acc.nearestDeadline) {
      acc.nearestDeadline = part.nearestDeadline;
    }
  }
  if (part.latestDeadline !== null) {
    if (acc.latestDeadline === null || part.latestDeadline > acc.latestDeadline) {
      acc.latestDeadline = part.latestDeadline;
    }
  }
}

/**
 * Дерево в плоский список (DFS): узел → его дочерние узлы (поддерево) → его
 * прямые задачи («папки выше файлов»), потом следующий сиблинг. Задачи с
 * nodeId вне переданного набора узлов считаются «Без узла». Секция «Без
 * узла» — последней строкой.
 */
export function buildStructureRows(nodes: ProjectNode[], tasks: TaskListItem[]): StructureRow[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childrenOf = new Map<string | null, ProjectNode[]>();
  for (const node of nodes) {
    const parent = node.parentId && nodeIds.has(node.parentId) ? node.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(node);
    childrenOf.set(parent, list);
  }
  const tasksOf = new Map<string, TaskListItem[]>();
  const noNode: TaskListItem[] = [];
  for (const task of tasks) {
    if (task.nodeId && nodeIds.has(task.nodeId)) {
      const list = tasksOf.get(task.nodeId) ?? [];
      list.push(task);
      tasksOf.set(task.nodeId, list);
    } else {
      noNode.push(task);
    }
  }

  const countDescendants = (nodeId: string): number =>
    (childrenOf.get(nodeId) ?? []).reduce((sum, child) => sum + 1 + countDescendants(child.id), 0) +
    (tasksOf.get(nodeId)?.length ?? 0);

  const rows: StructureRow[] = [];
  const walk = (node: ProjectNode, depth: number): ProjectNodeRollup => {
    const subtree: ProjectNodeRollup = { ...EMPTY_ROLLUP };
    addRollup(subtree, node.rollup);
    const children = childrenOf.get(node.id) ?? [];
    const ownTasks = tasksOf.get(node.id) ?? [];
    // Раскрываемость: и папки-потомки, и задачи-листья (папка только с
    // задачами тоже сворачивается).
    rows.push({
      kind: 'node',
      node,
      depth,
      subtree,
      hasChildren: children.length > 0 || ownTasks.length > 0,
      descendantCount: countDescendants(node.id),
    });
    for (const child of children) addRollup(subtree, walk(child, depth + 1));
    // Задачи-листья — после поддерева папок (проводник: папки выше файлов).
    for (const task of ownTasks) {
      rows.push({ kind: 'task', task, depth: depth + 1 });
    }
    return subtree;
  };
  for (const root of childrenOf.get(null) ?? []) walk(root, 0);
  if (noNode.length > 0) rows.push({ kind: 'noNode', count: noNode.length });
  for (const task of noNode) rows.push({ kind: 'task', task, depth: 0 });
  return rows;
}

/** Видимые строки с учётом свёрнутых папок: строка скрыта, если свёрнут
 *  любой узел-предок (стек глубин свёрнутых ветвей). Секция «Без узла»
 *  сворачиванию не подлежит. */
export function filterVisibleRows(
  rows: StructureRow[],
  collapsed: ReadonlySet<string>,
): StructureRow[] {
  const visible: StructureRow[] = [];
  const hiddenBelow: number[] = [];
  for (const row of rows) {
    if (row.kind === 'noNode') {
      visible.push(row);
      continue;
    }
    while (hiddenBelow.length > 0 && row.depth <= (hiddenBelow[hiddenBelow.length - 1] ?? 0)) {
      hiddenBelow.pop();
    }
    if (hiddenBelow.length > 0) continue;
    visible.push(row);
    if (row.kind === 'node' && row.hasChildren && collapsed.has(row.node.id)) {
      hiddenBelow.push(row.depth);
    }
  }
  return visible;
}

/**
 * Поиск по структуре: оставляет совпавшие узлы/задачи и их предков (путь
 * виден), «Без узла» — только при совпадениях среди её задач. Узел-совпадение
 * не раскрывает всё поддерево — поиск показывает место, а не всё содержимое.
 * Пустой запрос возвращает исходный список.
 */
export function filterStructureRows(rows: StructureRow[], query: string): StructureRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  const matches = (row: StructureRow): boolean => {
    if (row.kind === 'node') {
      return (
        row.node.name.toLowerCase().includes(needle) ||
        (row.node.code?.toLowerCase().includes(needle) ?? false)
      );
    }
    if (row.kind === 'task') {
      return (
        row.task.title.toLowerCase().includes(needle) || String(row.task.number).includes(needle)
      );
    }
    return false;
  };

  const keep = new Set<number>();
  rows.forEach((row, index) => {
    if (row.kind === 'noNode' || !matches(row)) return;
    keep.add(index);
    let depth = row.depth;
    for (let j = index - 1; j >= 0 && depth > 0; j -= 1) {
      const prev = rows[j];
      if (prev && prev.kind === 'node' && prev.depth < depth) {
        keep.add(j);
        depth = prev.depth;
      }
    }
  });

  const out: StructureRow[] = [];
  rows.forEach((row, index) => {
    if (row.kind === 'noNode') {
      const matchedTasks = rows
        .slice(index + 1)
        .filter((below) => below.kind === 'task' && matches(below)).length;
      if (matchedTasks > 0) out.push({ ...row, count: matchedTasks });
      return;
    }
    if (keep.has(index)) out.push(row);
  });
  return out;
}

/** Все id узлов поддерева (сам узел + потомки) — блок циклов DnD. */
export function subtreeNodeIds(nodes: ProjectNode[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  const childrenOf = new Map<string | null, ProjectNode[]>();
  for (const node of nodes) {
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }
  const walk = (id: string) => {
    for (const child of childrenOf.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        walk(child.id);
      }
    }
  };
  walk(rootId);
  return out;
}

/** Опции селекта узла (окна создания/переноса): плоский список с отступом
 *  по глубине; `excludeSubtreeOf` выкидывает само поддерево (нельзя переносить
 *  узел в себя/потомка). */
export function nodeOptions(
  nodes: ProjectNode[],
  excludeSubtreeOf?: string,
): { id: string; label: string }[] {
  const byParent = new Map<string | null, ProjectNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const out: { id: string; label: string }[] = [];
  const excluded = excludeSubtreeOf ? subtreeNodeIds(nodes, excludeSubtreeOf) : null;
  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      if (!excluded?.has(node.id))
        out.push({ id: node.id, label: `${'— '.repeat(depth)}${node.name}` });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Оптимистичный перенос узла в кэше структуры: порядок сиблингов = порядок
 *  в массиве nodes; якорь beforeId/afterId — среди детей ЦЕЛЕВОГО родителя,
 *  без якоря — последним ребёнком (зеркало серверного правила move). */
export function applyNodeMove(
  nodes: ProjectNode[],
  nodeId: string,
  parentId: string | null,
  anchor: { beforeId?: string; afterId?: string } = {},
): ProjectNode[] {
  const moving = nodes.find((node) => node.id === nodeId);
  if (!moving) return nodes;
  const rest = nodes.filter((node) => node.id !== nodeId);
  const isSibling = (node: ProjectNode) => node.parentId === parentId && node.id !== nodeId;
  const before = anchor.beforeId
    ? rest.find((n) => n.id === anchor.beforeId && isSibling(n))
    : undefined;
  const after = anchor.afterId
    ? rest.find((n) => n.id === anchor.afterId && isSibling(n))
    : undefined;
  const moved: ProjectNode = { ...moving, parentId };
  const out = [...rest];
  if (before) out.splice(out.indexOf(before), 0, moved);
  else if (after) out.splice(out.indexOf(after) + 1, 0, moved);
  else {
    const siblings = out.filter(isSibling);
    const last = siblings[siblings.length - 1];
    if (last) out.splice(out.indexOf(last) + 1, 0, moved);
    else out.push(moved);
  }
  return out;
}
