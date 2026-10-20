import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { WorkflowDraftDocument } from '@nodus/contracts';

import type { AnyFlowNode } from './any-node.js';
import { ROUTE_GEOMETRY } from './route-layout.js';
import { U_BASE, anyNodeId, resolveRoute } from './route-resolve.js';
import type { StartFlowNode } from './start-node.js';
import type { StatusFlowNode } from './status-node.js';
import type { TransitionFlowEdge } from './transition-edge.js';

export { anyNodeId, transitionOfAnyNode } from './route-resolve.js';

/**
 * Сборка графа холста из документа маршрута (#378 ред. 2, ADR-0022):
 * раскладка — `resolveRoute` (общая расстановка документа, иначе авто),
 * здесь — узлы и рёбра React Flow: статусы, метки «Любой статус» со
 * стрелкой в статус, старт на линии начального статуса. Чистая: редактор и
 * «Схема маршрута» получают одинаковый результат.
 */

export const START_NODE_ID = 'route-start';
export const START_EDGE_ID = 'route-start-edge';

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

function marker(color: string) {
  return { type: MarkerType.ArrowClosed, width: 14, height: 14, color };
}

export function buildRouteGraph(
  doc: WorkflowDraftDocument,
  options: RouteGraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const route = resolveRoute(doc);
  const readOnly = options.readOnly;
  const isSelected = (kind: 'stage' | 'transition', id: string) =>
    options.selection?.kind === kind && options.selection.id === id;

  const nodes: Node[] = doc.stages.map(
    (stage) =>
      ({
        id: stage.id,
        type: 'status',
        position: route.positions.get(stage.id)!,
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
      }) satisfies StatusFlowNode,
  );

  for (const [transitionId, anchor] of route.anchors) {
    nodes.push({
      id: anyNodeId(transitionId),
      type: 'any',
      position: anchor,
      selected: isSelected('transition', transitionId),
      draggable: !readOnly,
      connectable: false,
      deletable: !readOnly,
      data: { transitionId, readOnly },
    } satisfies AnyFlowNode);
  }

  const byId = new Map(doc.transitions.map((t) => [t.id, t]));
  const edges: Edge[] = [];
  for (const input of route.inputs) {
    const t = byId.get(input.id)!;
    const h = route.handles.get(t.id);
    if (!h) continue;
    const selected = isSelected('transition', t.id);
    const { offset, shift } = route.spread.get(t.id) ?? { offset: U_BASE, shift: 0 };
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
        labelT: route.layout.transitions[t.id]?.labelT ?? 0.5,
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
    const p = route.positions.get(initial.id)!;
    nodes.push({
      id: START_NODE_ID,
      type: 'start',
      position: {
        x: p.x - ROUTE_GEOMETRY.startWidth - ROUTE_GEOMETRY.startGap,
        y: p.y + (ROUTE_GEOMETRY.stageHeight - ROUTE_GEOMETRY.startHeight) / 2,
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
