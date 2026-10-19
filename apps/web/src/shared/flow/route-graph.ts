import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { TransitionDisplay, WorkflowDraftDocument } from '@nodus/contracts';

import { parallelIndex, routeTransition } from './edge-routing.js';
import { ROUTE_GEOMETRY, layoutBottom, layoutRoute } from './route-layout.js';
import type { StartFlowNode } from './start-node.js';
import type { StatusFlowNode } from './status-node.js';
import type { TransitionFlowEdge } from './transition-edge.js';

/**
 * Сборка графа холста из документа маршрута (#378): свободная слоевая
 * раскладка (route-layout) + рёбра по коридорам/магистрали (edge-routing).
 * Чистая — редактор и «Схема маршрута» получают одинаковый результат; свой
 * набор позиций (ручное перетаскивание черновика) подмешивает редактор.
 */

export interface RouteGraphOptions {
  readOnly: boolean;
  /** Бейдж проблемы на статусе (id статуса). */
  problemStageIds?: ReadonlySet<string>;
  /** Подсветка текущего статуса задачи («Схема маршрута»). */
  currentStageId?: string | null;
  /** Кнопки, доступные текущему пользователю (выделены в «Схеме маршрута»). */
  highlightedTransitionIds?: ReadonlySet<string>;
  /** Пилюли «из любого»; false — скрыть (упрощение чтения). */
  showPills?: boolean;
  onSelectStage?: (id: string) => void;
  onSelectTransition?: (id: string) => void;
  /** Ручные позиции статусов черновика (перетаскивание в редакторе). */
  positions?: Readonly<Record<string, { x: number; y: number }>>;
}

const HANDLE_ID = { l: 'l', r: 'r', t: 't', b: 'b' } as const;

export function buildRouteGraph(
  doc: WorkflowDraftDocument,
  options: RouteGraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const layout = layoutRoute(doc.stages, doc.transitions);
  const laneY = layoutBottom(doc.stages, layout) + ROUTE_GEOMETRY.laneOffset;

  const pillsByTarget = new Map<
    string,
    { id: string; name: string; display: TransitionDisplay }[]
  >();
  for (const t of doc.transitions) {
    if (t.fromStageId !== null) continue;
    const list = pillsByTarget.get(t.toStageId) ?? [];
    list.push({ id: t.id, name: t.name, display: t.display });
    pillsByTarget.set(t.toStageId, list);
  }

  const entryOf = (id: string) => {
    const base = layout.get(id)!;
    const override = options.positions?.[id];
    return { x: override?.x ?? base.x, y: override?.y ?? base.y, layer: base.layer };
  };

  // Статусы: свободные позиции, перетаскивание — любое.
  const stageNodes: StatusFlowNode[] = doc.stages.map((stage) => {
    const entry = entryOf(stage.id);
    return {
      id: stage.id,
      type: 'status',
      position: { x: entry.x, y: entry.y },
      data: {
        name: stage.name,
        color: stage.color,
        systemState: stage.systemState,
        isInitial: stage.isInitial,
        outcome: stage.outcome,
        hasProblem: options.problemStageIds?.has(stage.id) ?? false,
        current: options.currentStageId === stage.id,
        readOnly: options.readOnly,
        pills: options.showPills === false ? [] : (pillsByTarget.get(stage.id) ?? []),
        onSelectTransition: options.onSelectTransition,
      },
    };
  });

  // Рёбра-кнопки: параллельные пары — стабильные коридоры по sortOrder.
  const routed = doc.transitions
    .filter((t) => t.fromStageId !== null)
    .map((t) => ({ id: t.id, fromId: t.fromStageId!, toId: t.toStageId, sortOrder: t.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const pairs = routed.map((t) => ({ id: t.id, fromId: t.fromId, toId: t.toId }));

  const transitionEdges: TransitionFlowEdge[] = routed.map((t) => {
    const from = entryOf(t.fromId);
    const to = entryOf(t.toId);
    const route = routeTransition(from, to, parallelIndex(pairs, t.id), laneY);
    const highlighted = options.highlightedTransitionIds?.has(t.id) ?? false;
    const transition = doc.transitions.find((tr) => tr.id === t.id)!;
    return {
      id: t.id,
      type: 'transition',
      source: t.fromId,
      sourceHandle: route.sourceHandle,
      target: t.toId,
      targetHandle: route.targetHandle,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      data: {
        name: transition.name,
        display: transition.display,
        points: route.points,
        label: route.label,
        // «Схема маршрута»: доступные кнопки — в силе, остальные приглушены.
        dim: options.highlightedTransitionIds ? !highlighted : false,
        onSelect: options.onSelectTransition ? () => options.onSelectTransition!(t.id) : undefined,
      },
    };
  });

  // Старт-терминал и стрелка в начальный статус.
  const initial = doc.stages.find((s) => s.isInitial);
  const nodes: Node[] = [...stageNodes];
  const edges: Edge[] = [...transitionEdges];
  if (initial) {
    const entry = entryOf(initial.id);
    const startNode: StartFlowNode = {
      id: 'route-start',
      type: 'start',
      position: {
        x: entry.x - ROUTE_GEOMETRY.startWidth - ROUTE_GEOMETRY.startGap,
        y: entry.y + (ROUTE_GEOMETRY.stageHeight - ROUTE_GEOMETRY.startHeight) / 2,
      },
      draggable: false,
      data: {
        active: false,
        onSelect: options.readOnly ? undefined : () => options.onSelectStage?.(initial.id),
      },
    };
    nodes.push(startNode);
    edges.push({
      id: 'route-start-edge',
      source: 'route-start',
      sourceHandle: HANDLE_ID.r,
      target: initial.id,
      targetHandle: HANDLE_ID.l,
      type: 'transition',
      data: { name: '', display: 'button', points: [], label: null },
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    });
  }

  return { nodes, edges };
}
