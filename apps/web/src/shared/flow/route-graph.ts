import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import type { TaskSystemState, TransitionDisplay, WorkflowDraftDocument } from '@nodus/contracts';

import { BAND_GEOMETRY, layoutBands } from './band-layout.js';
import { parallelIndex, routeEdge } from './edge-routing.js';
import type { BandFlowNode } from './band-node.js';
import type { StartFlowNode } from './start-node.js';
import type { StatusFlowNode } from './status-node.js';
import type { TransitionFlowEdge } from './transition-edge.js';

/** Сборка графа холста из документа маршрута (#378): колонки-этапы,
 *  статусы (слоты по колонкам), старт-терминал, рёбра-кнопки с портами по
 *  взаимному положению. Чистая — редактор и «Схема маршрута» получают
 *  одинаковые координаты.
 */

export interface RouteGraphOptions {
  readOnly: boolean;
  /** Бейдж проблемы на статусе (id статуса). */
  problemStageIds?: ReadonlySet<string>;
  /** Подсветка текущего статуса задачи («Схема маршрута»). */
  currentStageId?: string | null;
  /** Кнопки, доступные текущему пользователю (выделены в «Схеме маршрута»). */
  highlightedTransitionIds?: ReadonlySet<string>;
  /** Меню «из любого» в пилюлях; null — пилюль нет (упрощение чтения). */
  showPills?: boolean;
  onSelectStage?: (id: string) => void;
  onSelectTransition?: (id: string) => void;
  onAddStage?: (band: TaskSystemState) => void;
}

const POSITION_TO_HANDLE: Record<Position, string> = {
  [Position.Left]: 'l',
  [Position.Right]: 'r',
  [Position.Top]: 't',
  [Position.Bottom]: 'b',
};

/** Абсолютные координаты статуса (колонка + слот) для роутинга рёбер. */
function absolutePoints(doc: WorkflowDraftDocument) {
  const layout = layoutBands(doc.stages);
  const points = new Map<
    string,
    { x: number; y: number; band: number; index: number; systemState: TaskSystemState }
  >();
  const bandIndex = new Map(layout.bands.map((b, i) => [b.id, i]));
  for (const slot of layout.stages) {
    const band = layout.bands.find((b) => b.id === slot.bandId)!;
    points.set(slot.id, {
      x: band.x + slot.x + BAND_GEOMETRY.stageWidth / 2,
      y: band.y + slot.y + BAND_GEOMETRY.stageHeight / 2,
      band: bandIndex.get(slot.bandId) ?? 0,
      index: slot.index,
      systemState: slot.systemState,
    });
  }
  return { layout, points };
}

export function buildRouteGraph(
  doc: WorkflowDraftDocument,
  options: RouteGraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const { layout, points } = absolutePoints(doc);
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

  // Колонки-этапы (родители статусов).
  const bandNodes: BandFlowNode[] = layout.bands.map((band) => ({
    id: band.id,
    type: 'band',
    position: { x: band.x, y: band.y },
    style: { width: band.width, height: band.height },
    draggable: false,
    selectable: false,
    data: {
      systemState: band.systemState,
      count: band.stageIds.length,
      readOnly: options.readOnly,
      onAddStage: options.onAddStage,
    },
  }));

  // Статусы: слоты внутри колонки, перетаскивание — по вертикали (extent).
  const stageNodes: StatusFlowNode[] = doc.stages.map((stage) => {
    const slot = layout.stages.find((s) => s.id === stage.id)!;
    return {
      id: stage.id,
      type: 'status',
      parentId: slot.bandId,
      extent: 'parent',
      position: { x: slot.x, y: slot.y },
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

  // Рёбра-кнопки: порты по взаимному положению, параллельные — с шагом.
  const routed = doc.transitions.filter((t) => t.fromStageId !== null);
  const pairs = routed.map((t) => {
    const from = points.get(t.fromStageId!)!;
    const to = points.get(t.toStageId)!;
    return { id: t.id, fromBand: from.band, toBand: to.band };
  });
  const transitionEdges: TransitionFlowEdge[] = routed.map((t) => {
    const from = points.get(t.fromStageId!)!;
    const to = points.get(t.toStageId)!;
    const parallel = parallelIndex(pairs, t.id);
    const route = routeEdge(from, to, parallel);
    const highlighted = options.highlightedTransitionIds?.has(t.id) ?? false;
    return {
      id: t.id,
      type: 'transition',
      source: t.fromStageId!,
      sourceHandle: POSITION_TO_HANDLE[route.sourcePosition],
      target: t.toStageId,
      targetHandle: POSITION_TO_HANDLE[route.targetPosition],
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      data: {
        name: t.name,
        display: t.display,
        offset: route.offset,
        labelShift: parallel % 2 === 0 ? parallel * 7 : -parallel * 7,
        // «Схема маршрута»: доступные кнопки — в силе, остальные приглушены.
        dim: options.highlightedTransitionIds ? !highlighted : false,
        onSelect: options.onSelectTransition ? () => options.onSelectTransition!(t.id) : undefined,
      },
    };
  });

  // Старт-терминал и стрелка в начальный статус.
  const initial = doc.stages.find((s) => s.isInitial);
  const nodes: Node[] = [...bandNodes, ...stageNodes];
  const edges: Edge[] = [...transitionEdges];
  if (initial) {
    const point = points.get(initial.id)!;
    const startNode: StartFlowNode = {
      id: 'route-start',
      type: 'start',
      position: { x: point.x - BAND_GEOMETRY.stageWidth / 2 - 96, y: point.y - 20 },
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
      sourceHandle: 'r',
      target: initial.id,
      targetHandle: POSITION_TO_HANDLE[Position.Left],
      type: 'transition',
      data: { name: '', display: 'button', offset: 0, labelShift: 0 },
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    });
  }

  return { nodes, edges };
}
