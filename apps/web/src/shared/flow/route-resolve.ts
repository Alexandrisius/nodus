import type {
  FlowHandleId,
  WorkflowDraftDocument,
  WorkflowLayout,
  WorkflowLayoutTransition,
} from '@nodus/contracts';
import { flowHandleIdSchema } from '@nodus/contracts';

import {
  assignHandles,
  autoSides,
  handleSide,
  type FlowBox,
  type HandleEdgeInput,
} from './flow-handles.js';
import type { FlowPt } from './edge-geometry.js';
import { ROUTE_GEOMETRY, resolvePositions, type FlowPosition } from './route-layout.js';
import { edgePath, labelBoxAt, labelWidth, placeLabel } from './route-labels.js';
import { U_BASE, edgeSpread, type RouteLoop } from './route-loops.js';

export { U_BASE } from './route-loops.js';

/**
 * Разрешение раскладки маршрута (#378 ред. 2, ADR-0022) — чистые функции:
 * где стоит каждый статус и метка «Любой статус», к каким точкам подключена
 * каждая стрелка, как разнесены обходы. Сохранённое в `document.layout` —
 * закон, остальное — авторасстановка. `frozenLayout` превращает видимую
 * картинку в полную раскладку: редактор фиксирует её первой же правкой, чтобы
 * дальше двигалось только то, что двигает пользователь.
 */

const ANY_PREFIX = 'any:';

export const anyNodeId = (transitionId: string): string => `${ANY_PREFIX}${transitionId}`;

/** id кнопки по узлу метки «Любой статус» (null — не метка). */
export function transitionOfAnyNode(nodeId: string): string | null {
  return nodeId.startsWith(ANY_PREFIX) ? nodeId.slice(ANY_PREFIX.length) : null;
}

const EMPTY_LAYOUT: WorkflowLayout = { stages: {}, transitions: {} };

export interface ResolvedRoute {
  layout: WorkflowLayout;
  /** Позиции статусов. */
  positions: Map<string, FlowPosition>;
  /** Места меток «Любой статус» по id кнопки. */
  anchors: Map<string, FlowPosition>;
  /** Рёбра: источник (статус или метка), цель, сохранённые точки. */
  inputs: HandleEdgeInput[];
  handles: Map<string, { sourceHandle: string; targetHandle: string }>;
  /** Разнос: глубина U-обхода и сдвиг излома параллельных. */
  spread: Map<string, { offset: number; shift: number }>;
  /** Геометрия U-обходов (вход и выход с одной стороны). */
  loops: Map<string, RouteLoop>;
  /** Отпечаток концов стрелки: боксы и точки (сдвинулась ли стрелка). */
  ends: Map<string, string>;
  /** Пути стрелок (как их рисует холст) — для подписей. */
  paths: Map<string, FlowPt[]>;
  /** Узлы холста — статусы, метки, «Создание задачи» (препятствия подписей). */
  nodeBoxes: FlowBox[];
  /** Доля пути подписи каждой кнопки с названием. */
  labels: Map<string, number>;
}

/** Бокс старта «Создание задачи» у начального статуса (как в route-graph). */
export function startBoxOf(initial: FlowPosition): FlowBox {
  const g = ROUTE_GEOMETRY;
  return {
    x: initial.x - g.startWidth - g.startGap,
    y: initial.y + (g.stageHeight - g.startHeight) / 2,
    w: g.startWidth,
    h: g.startHeight,
  };
}

export function resolveRoute(doc: WorkflowDraftDocument): ResolvedRoute {
  const layout = doc.layout ?? EMPTY_LAYOUT;
  const { stageWidth: W, stageHeight: H, anyWidth, anyHeight } = ROUTE_GEOMETRY;
  const positions = resolvePositions(doc.stages, doc.transitions, layout.stages);
  const boxes = new Map<string, FlowBox>();
  for (const [id, p] of positions) boxes.set(id, { ...p, w: W, h: H });

  // Метки «Любой статус»: по умолчанию над и левее цели, стопкой; место,
  // куда метку перетащили, — сохранённое.
  const inputs: HandleEdgeInput[] = [];
  const anchors = new Map<string, FlowPosition>();
  const anyPerTarget = new Map<string, number>();
  for (const t of doc.transitions) {
    const saved = layout.transitions[t.id];
    if (t.fromStageId !== null) {
      inputs.push({
        id: t.id,
        source: t.fromStageId,
        target: t.toStageId,
        sourceHandle: saved?.sourceHandle,
        targetHandle: saved?.targetHandle,
      });
      continue;
    }
    const target = boxes.get(t.toStageId);
    if (!target) continue;
    const index = anyPerTarget.get(t.toStageId) ?? 0;
    anyPerTarget.set(t.toStageId, index + 1);
    const anchor = saved?.anchor ?? {
      x: target.x - anyWidth / 2,
      y: target.y - 72 - index * (anyHeight + 8),
    };
    const pill = { ...anchor, w: anyWidth, h: anyHeight };
    const [side] = autoSides(pill, target);
    anchors.set(t.id, anchor);
    inputs.push({
      id: t.id,
      source: anyNodeId(t.id),
      target: t.toStageId,
      sourceHandle: `${side}2`,
      targetHandle: saved?.targetHandle,
    });
    boxes.set(anyNodeId(t.id), pill);
  }

  // Препятствия для «прямого коридора» — только статусы (метка не ломает
  // стороны чужих стрелок).
  const handles = assignHandles(inputs, boxes, (id) => transitionOfAnyNode(id) === null);
  const { spread, loops } = edgeSpread(
    inputs,
    handles,
    boxes,
    (id) => layout.transitions[id]?.offset,
  );
  const ends = new Map<string, string>();
  const paths = new Map<string, FlowPt[]>();
  for (const input of inputs) {
    const h = handles.get(input.id);
    const a = boxes.get(input.source);
    const b = boxes.get(input.target);
    if (!h || !a || !b) continue;
    ends.set(input.id, `${a.x},${a.y},${h.sourceHandle}|${b.x},${b.y},${h.targetHandle}`);
    const s = spread.get(input.id) ?? { offset: U_BASE, shift: 0 };
    paths.set(input.id, edgePath(a, h.sourceHandle, b, h.targetHandle, s));
  }

  // Подписи: сохранённое место — закон (стоит первым), новые — на своей
  // стрелке без наезда на узлы и уже стоящие подписи.
  const initial = doc.stages.find((s) => s.isInitial);
  const nodeBoxes = [...boxes.values()];
  if (initial && positions.has(initial.id)) nodeBoxes.push(startBoxOf(positions.get(initial.id)!));
  const labels = new Map<string, number>();
  const taken: FlowBox[] = [...nodeBoxes];
  const named = doc.transitions.filter((t) => t.name !== '' && paths.has(t.id));
  for (const t of named) {
    const saved = layout.transitions[t.id]?.labelT;
    if (saved === undefined) continue;
    labels.set(t.id, saved);
    taken.push(labelBoxAt(paths.get(t.id)!, saved, labelWidth(t.name)));
  }
  for (const t of named) {
    if (labels.has(t.id)) continue;
    const points = paths.get(t.id)!;
    const width = labelWidth(t.name);
    const at = placeLabel(points, width, taken);
    labels.set(t.id, at);
    taken.push(labelBoxAt(points, at, width));
  }
  return {
    layout,
    positions,
    anchors,
    inputs,
    handles,
    spread,
    loops,
    ends,
    paths,
    nodeBoxes,
    labels,
  };
}

function asHandle(id: string | undefined): FlowHandleId | undefined {
  const parsed = flowHandleIdSchema.safeParse(id);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Полная раскладка ровно той картинки, что сейчас на холсте: позиции всех
 * статусов, точки всех стрелок (у кнопки «из любого» — только цель), глубины
 * обходов и места подписей на стрелках. Место метки «Любой статус» не
 * фиксируется — она следует за своим статусом.
 */
export function frozenLayout(doc: WorkflowDraftDocument): WorkflowLayout {
  const route = resolveRoute(doc);
  const stages: WorkflowLayout['stages'] = {};
  for (const [id, p] of route.positions) stages[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  const transitions: WorkflowLayout['transitions'] = { ...route.layout.transitions };
  for (const t of doc.transitions) {
    const h = route.handles.get(t.id);
    if (!h) continue;
    const entry: WorkflowLayoutTransition = { ...transitions[t.id] };
    if (t.fromStageId !== null) entry.sourceHandle ??= asHandle(h.sourceHandle);
    entry.targetHandle ??= asHandle(h.targetHandle);
    if (route.loops.has(t.id)) entry.offset ??= route.spread.get(t.id)?.offset;
    const label = route.labels.get(t.id);
    if (label !== undefined) entry.labelT ??= label;
    transitions[t.id] = entry;
  }
  return { stages, transitions };
}

/** Видимая картинка уже полностью зафиксирована в раскладке? */
export function isLayoutComplete(doc: WorkflowDraftDocument): boolean {
  const layout = doc.layout ?? EMPTY_LAYOUT;
  return (
    doc.stages.every((s) => layout.stages[s.id] !== undefined) &&
    doc.transitions.every((t) => {
      const entry = layout.transitions[t.id];
      if (entry?.targetHandle === undefined) return false;
      if (t.name !== '' && entry.labelT === undefined) return false;
      if (t.fromStageId === null) return true;
      if (entry.sourceHandle === undefined) return false;
      // U-обход (вход и выход с одной стороны) — ещё и с глубиной.
      const loop = handleSide(entry.sourceHandle) === handleSide(entry.targetHandle);
      return !loop || entry.offset !== undefined;
    })
  );
}
