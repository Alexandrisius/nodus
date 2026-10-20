import type { TaskSystemState } from '@nodus/contracts';

/**
 * Слоевая авторасстановка холста маршрута (#378, реф Jira workflow editor):
 * свободный канвас без колонок — статусы раскладываются слоями слева направо
 * по длиннейшему пути от начального; между слоями — широкие коридоры под
 * подписи кнопок. Расстановка — ОБЩАЯ (раскладка документа, ADR-0022):
 * сохранённая позиция статуса — закон, авторасстановка — только для
 * статусов без позиции и для «Упорядочить». Чистые функции.
 */

/** Геометрия холста, дизайн-px (масштаб — зумом React Flow, не токенами). */
export const ROUTE_GEOMETRY = {
  stageWidth: 208,
  stageHeight: 52,
  /** Коридор между слоями: изломы рёбер + подписи кнопок. */
  layerGap: 176,
  /** Вертикальный ритм статусов одного слоя. */
  rowGap: 72,
  /** Поля раскладки от нуля холста. */
  margin: 48,
  /** Старт-терминал «Создание задачи» (высота — ровно h-10: центр на линии). */
  startWidth: 156,
  startHeight: 40,
  /** Зазор между стартом и начальным статусом. */
  startGap: 64,
  /** Метка «Любой статус» (пилюля) и её место по умолчанию у цели. */
  anyWidth: 128,
  anyHeight: 28,
} as const;

/** Порядок системных состояний внутри слоя (стабильность раскладки). */
const STATE_ORDER: Record<TaskSystemState, number> = {
  backlog: 0,
  active: 1,
  paused: 2,
  done: 3,
  closed: 4,
};

export interface RouteLayoutEntry {
  x: number;
  y: number;
  layer: number;
}

export type RouteLayout = Map<string, RouteLayoutEntry>;

export interface LayoutStageInput {
  id: string;
  systemState: TaskSystemState;
  sortOrder: number;
  isInitial: boolean;
}

/** Слои по длиннейшему пути: layer(to) = max(layer(from) + 1). Циклы
 *  разрываются: обратные рёбра (DFS от начального) в раскладке не участвуют
 *  — иначе релаксация разгоняет слои до бесконечности. */
function layerStages(
  stages: readonly LayoutStageInput[],
  transitions: readonly { fromStageId: string | null; toStageId: string }[],
): Map<string, number> {
  const layer = new Map<string, number>();
  const initial = stages.find((s) => s.isInitial) ?? stages[0];
  if (initial) layer.set(initial.id, 0);

  // DFS от начального: обратные рёбра (в вершину стека) — вне раскладки.
  // Кнопки «из любого» (fromStageId = null) считаются исходящими от старта —
  // их цели достижимы с самого начала маршрута.
  const dagEdges: { from: string; to: string }[] = [];
  const color = new Map<string, 1 | 2>(); // 1 — в стеке, 2 — закрыта
  const adjacency = new Map<string, string[]>();
  for (const t of transitions) {
    const from = t.fromStageId ?? initial?.id ?? null;
    if (from === null) continue;
    const list = adjacency.get(from) ?? [];
    list.push(t.toStageId);
    adjacency.set(from, list);
  }
  const visit = (id: string) => {
    color.set(id, 1);
    for (const next of adjacency.get(id) ?? []) {
      if (color.get(next) === 1) continue; // обратное ребро цикла
      dagEdges.push({ from: id, to: next });
      if (color.get(next) !== 2) visit(next);
    }
    color.set(id, 2);
  };
  if (initial) visit(initial.id);

  const relax = (edges: readonly { from: string; to: string }[], only?: Set<string>) => {
    for (let i = 0; i < stages.length + 1; i += 1) {
      for (const e of edges) {
        if (only !== undefined && !only.has(e.to)) continue;
        if (!layer.has(e.from)) continue;
        const candidate = layer.get(e.from)! + 1;
        const current = layer.get(e.to);
        if (current === undefined || candidate > current) layer.set(e.to, candidate);
      }
    }
  };
  relax(dagEdges);

  // Недостижимые от начального (ошибка схемы, но раскладка обязана их
  // показать): своя релаксация внутри подмножества (достижимые не
  // поднимаются), затем сдвиг за достижимые.
  const orphans = stages.filter((s) => !layer.has(s.id));
  if (orphans.length > 0) {
    const reachable = Math.max(0, ...layer.values());
    const orphanIds = new Set(orphans.map((o) => o.id));
    const orphanEdges = transitions
      .filter((t) => t.fromStageId !== null && orphanIds.has(t.fromStageId))
      .map((t) => ({ from: t.fromStageId as string, to: t.toStageId }));
    for (const o of orphans) layer.set(o.id, 0);
    relax(orphanEdges, orphanIds);
    for (const o of orphans) layer.set(o.id, layer.get(o.id)! + reachable + 1);
  }
  return layer;
}

/** Статусы → точки свободного канваса (чистая, детерминированная). */
export function layoutRoute(
  stages: readonly LayoutStageInput[],
  transitions: readonly { fromStageId: string | null; toStageId: string }[],
): RouteLayout {
  const layer = layerStages(stages, transitions);

  const byLayer = new Map<number, LayoutStageInput[]>();
  for (const stage of stages) {
    const l = layer.get(stage.id) ?? 0;
    const bucket = byLayer.get(l) ?? [];
    bucket.push(stage);
    byLayer.set(l, bucket);
  }

  const result: RouteLayout = new Map();
  for (const [l, members] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    members.sort(
      (a, b) =>
        STATE_ORDER[a.systemState] - STATE_ORDER[b.systemState] ||
        a.sortOrder - b.sortOrder ||
        (a.id < b.id ? -1 : 1),
    );
    members.forEach((member, row) => {
      result.set(member.id, {
        x: ROUTE_GEOMETRY.margin + l * (ROUTE_GEOMETRY.stageWidth + ROUTE_GEOMETRY.layerGap),
        y: ROUTE_GEOMETRY.margin + row * (ROUTE_GEOMETRY.stageHeight + ROUTE_GEOMETRY.rowGap),
        layer: l,
      });
    });
  }
  return result;
}

export interface FlowPosition {
  x: number;
  y: number;
}

/**
 * Позиции статусов на холсте: сохранённые — как есть; без сохранённых
 * совсем — авторасстановка целиком; статусы без позиции при частичной
 * раскладке — рядом ниже расставленных (не поверх них).
 */
export function resolvePositions(
  stages: readonly LayoutStageInput[],
  transitions: readonly { fromStageId: string | null; toStageId: string }[],
  saved: Readonly<Record<string, FlowPosition>>,
): Map<string, FlowPosition> {
  const auto = layoutRoute(stages, transitions);
  const result = new Map<string, FlowPosition>();
  const placed = stages.filter((s) => saved[s.id] !== undefined);
  if (placed.length === 0) {
    for (const [id, entry] of auto) result.set(id, { x: entry.x, y: entry.y });
    return result;
  }
  const { stageHeight, stageWidth, rowGap, layerGap, margin } = ROUTE_GEOMETRY;
  const bottom = Math.max(...placed.map((s) => saved[s.id]!.y + stageHeight));
  const left = Math.min(...placed.map((s) => saved[s.id]!.x));
  let column = 0;
  for (const stage of stages) {
    const position = saved[stage.id];
    if (position) {
      result.set(stage.id, position);
      continue;
    }
    result.set(stage.id, {
      x: (Number.isFinite(left) ? left : margin) + column * (stageWidth + layerGap / 2),
      y: bottom + rowGap,
    });
    column += 1;
  }
  return result;
}
