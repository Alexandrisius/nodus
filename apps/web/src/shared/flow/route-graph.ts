import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { WorkflowDraftDocument, WorkflowLayout } from '@nodus/contracts';

import type { AnyFlowNode } from './any-node.js';
import {
  assignHandles,
  autoSides,
  handleSide,
  type FlowBox,
  type HandleEdgeInput,
} from './flow-handles.js';
import { ROUTE_GEOMETRY, resolvePositions } from './route-layout.js';
import type { StartFlowNode } from './start-node.js';
import type { StatusFlowNode } from './status-node.js';
import type { TransitionFlowEdge } from './transition-edge.js';

/**
 * Сборка графа холста из документа маршрута (#378 ред. 2, ADR-0022):
 * позиции — из ОБЩЕЙ раскладки документа (иначе авторасстановка), точки
 * подключения — сохранённые или авто, кнопки «из любого статуса» — метки
 * «Любой статус» со стрелкой в статус, старт — на линии начального статуса.
 * Чистая: редактор и «Схема маршрута» получают одинаковый результат.
 */

export const START_NODE_ID = 'route-start';
export const START_EDGE_ID = 'route-start-edge';
const ANY_PREFIX = 'any:';

export const anyNodeId = (transitionId: string): string => `${ANY_PREFIX}${transitionId}`;

/** id кнопки по узлу метки «Любой статус» (null — не метка). */
export function transitionOfAnyNode(nodeId: string): string | null {
  return nodeId.startsWith(ANY_PREFIX) ? nodeId.slice(ANY_PREFIX.length) : null;
}

export interface RouteGraphOptions {
  readOnly: boolean;
  /** Бейдж проблемы на статусе (id статуса). */
  problemStageIds?: ReadonlySet<string>;
  /** Подсветка текущего статуса задачи («Схема маршрута»). */
  currentStageId?: string | null;
  /** Кнопки, доступные текущему пользователю (выделены в «Схеме маршрута»). */
  highlightedTransitionIds?: ReadonlySet<string>;
  /** Счётчики задач по статусам (редактор). */
  stageTaskCounts?: Readonly<Record<string, number>>;
  /** Выделение редактора (кольцо узла, подсветка стрелки и её подписи). */
  selection?: { kind: 'stage' | 'transition'; id: string } | null;
  onSelectTransition?: (id: string) => void;
  /** Подпись перетащили вдоль стрелки (только редактор). */
  onLabelT?: (transitionId: string, t: number) => void;
}

const EMPTY_LAYOUT: WorkflowLayout = { stages: {}, transitions: {} };
const U_BASE = 24;
const U_STEP = 16;
const PARALLEL_STEP = 16;

function marker(color: string) {
  return { type: MarkerType.ArrowClosed, width: 14, height: 14, color };
}

/** Разнос рёбер: U одной стороны вкладываются (короткий пролёт — внутри),
 *  параллельные Z одной пары расходятся сдвигом излома. */
function edgeSpread(
  inputs: readonly HandleEdgeInput[],
  handles: ReadonlyMap<string, { sourceHandle: string; targetHandle: string }>,
  boxes: ReadonlyMap<string, FlowBox>,
): Map<string, { offset: number; shift: number }> {
  const result = new Map<string, { offset: number; shift: number }>();
  const pairs = new Map<string, string[]>();
  const loops: { id: string; side: string; lo: number; hi: number; level: number }[] = [];
  for (const input of inputs) {
    const h = handles.get(input.id);
    const a = boxes.get(input.source);
    const b = boxes.get(input.target);
    if (!h || !a || !b) continue;
    const s = handleSide(h.sourceHandle);
    const d = handleSide(h.targetHandle);
    if (s === d) {
      const alongX = s === 't' || s === 'b';
      loops.push({
        id: input.id,
        side: s,
        lo: alongX ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
        hi: alongX ? Math.max(a.x + a.w, b.x + b.w) : Math.max(a.y + a.h, b.y + b.h),
        level: 0,
      });
    } else {
      const key = `${input.source}|${input.target}|${s}|${d}`;
      pairs.set(key, [...(pairs.get(key) ?? []), input.id]);
    }
  }
  for (const ids of pairs.values()) {
    ids.forEach((id, i) =>
      result.set(id, { offset: U_BASE, shift: (i - (ids.length - 1) / 2) * PARALLEL_STEP }),
    );
  }
  loops.sort((x, y) => x.hi - x.lo - (y.hi - y.lo));
  const placed: typeof loops = [];
  for (const loop of loops) {
    loop.level = placed
      .filter((p) => p.side === loop.side && p.lo < loop.hi && loop.lo < p.hi)
      .reduce((max, p) => Math.max(max, p.level + 1), 0);
    placed.push(loop);
    result.set(loop.id, { offset: U_BASE + U_STEP * loop.level, shift: 0 });
  }
  return result;
}

export function buildRouteGraph(
  doc: WorkflowDraftDocument,
  options: RouteGraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const layout = doc.layout ?? EMPTY_LAYOUT;
  const { stageWidth: W, stageHeight: H, anyWidth, anyHeight } = ROUTE_GEOMETRY;
  const readOnly = options.readOnly;
  const isSelected = (kind: 'stage' | 'transition', id: string) =>
    options.selection?.kind === kind && options.selection.id === id;

  const positions = resolvePositions(doc.stages, doc.transitions, layout.stages);
  const boxes = new Map<string, FlowBox>();
  const nodes: Node[] = doc.stages.map((stage) => {
    const position = positions.get(stage.id)!;
    boxes.set(stage.id, { ...position, w: W, h: H });
    return {
      id: stage.id,
      type: 'status',
      position,
      selected: isSelected('stage', stage.id),
      draggable: !readOnly,
      connectable: !readOnly,
      deletable: !readOnly,
      data: {
        name: stage.name,
        color: stage.color,
        systemState: stage.systemState,
        isInitial: stage.isInitial,
        outcome: stage.outcome,
        hasProblem: options.problemStageIds?.has(stage.id) ?? false,
        current: options.currentStageId === stage.id,
        readOnly,
        taskCount: options.stageTaskCounts?.[stage.id] ?? 0,
      },
    } satisfies StatusFlowNode;
  });

  // Метки «Любой статус»: по умолчанию над и левее цели, стопкой.
  const inputs: HandleEdgeInput[] = [];
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
    nodes.push({
      id: anyNodeId(t.id),
      type: 'any',
      position: anchor,
      selected: isSelected('transition', t.id),
      draggable: !readOnly,
      connectable: false,
      deletable: !readOnly,
      data: { transitionId: t.id, readOnly },
    } satisfies AnyFlowNode);
    inputs.push({
      id: t.id,
      source: anyNodeId(t.id),
      target: t.toStageId,
      sourceHandle: `${side}2`,
      targetHandle: saved?.targetHandle,
    });
    boxes.set(anyNodeId(t.id), pill);
  }

  const handles = assignHandles(inputs, boxes);
  const spread = edgeSpread(inputs, handles, boxes);
  const byId = new Map(doc.transitions.map((t) => [t.id, t]));
  const edges: Edge[] = [];
  for (const input of inputs) {
    const t = byId.get(input.id)!;
    const h = handles.get(t.id);
    if (!h) continue;
    const selected = isSelected('transition', t.id);
    const { offset, shift } = spread.get(t.id) ?? { offset: U_BASE, shift: 0 };
    edges.push({
      id: t.id,
      type: 'transition',
      source: input.source,
      target: t.toStageId,
      sourceHandle: h.sourceHandle,
      targetHandle: h.targetHandle,
      selected,
      deletable: !readOnly,
      reconnectable: readOnly ? false : t.fromStageId === null ? 'target' : true,
      zIndex: selected ? 1 : 0,
      markerEnd: marker(selected ? 'var(--primary)' : 'var(--edge)'),
      data: {
        name: t.name,
        display: t.display,
        labelT: layout.transitions[t.id]?.labelT ?? 0.5,
        offset,
        shift,
        dim: options.highlightedTransitionIds ? !options.highlightedTransitionIds.has(t.id) : false,
        onSelect: options.onSelectTransition ? () => options.onSelectTransition!(t.id) : undefined,
        onLabelT: options.onLabelT ? (value) => options.onLabelT!(t.id, value) : undefined,
      },
    } satisfies TransitionFlowEdge);
  }

  // Старт «Создание задачи»: центр на линии центра начального — стрелка прямая.
  const initial = doc.stages.find((s) => s.isInitial);
  if (initial) {
    const p = positions.get(initial.id)!;
    nodes.push({
      id: START_NODE_ID,
      type: 'start',
      position: {
        x: p.x - ROUTE_GEOMETRY.startWidth - ROUTE_GEOMETRY.startGap,
        y: p.y + (H - ROUTE_GEOMETRY.startHeight) / 2,
      },
      draggable: false,
      selectable: false,
      deletable: false,
      connectable: !readOnly,
      data: { readOnly },
    } satisfies StartFlowNode);
    edges.push({
      id: START_EDGE_ID,
      type: 'transition',
      source: START_NODE_ID,
      sourceHandle: 'r',
      target: initial.id,
      targetHandle: 'l2',
      selectable: false,
      deletable: false,
      reconnectable: readOnly ? false : 'target',
      markerEnd: marker('var(--edge)'),
      data: { name: '', display: 'button', labelT: 0.5, offset: U_BASE, shift: 0 },
    } satisfies TransitionFlowEdge);
  }

  return { nodes, edges };
}
