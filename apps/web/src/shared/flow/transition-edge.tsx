import { memo, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  useStoreApi,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { TransitionDisplay } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import {
  edgeBend,
  orthogonalPoints,
  pointAt,
  projectT,
  roundedPath,
  segmentOnLine,
} from './edge-geometry.js';
import { sideOfPosition } from './flow-handles.js';

/** Данные ребра-кнопки: геометрия — от реальных точек подключения (React
 *  Flow), здесь только параметры разноса и положение подписи. */
export interface TransitionEdgeData extends Record<string, unknown> {
  name: string;
  display: TransitionDisplay;
  /** Подпись вдоль стрелки: 0 — у источника, 1 — у цели. */
  labelT: number;
  /** Вылет из точки / глубина U-обхода (разнос вложенных обходов). */
  offset: number;
  /** Сдвиг излома (параллельные кнопки одной пары). */
  shift: number;
  /** Приглушение («Схема маршрута»: кнопка недоступна пользователю). */
  dim?: boolean;
  onSelect?: () => void;
  /** Перетаскивание подписи (только редактор): t на отпускании. */
  onLabelT?: (t: number) => void;
  /** Свободный участок отодвинули (только редактор; null — вернуть авто). */
  onBend?: (param: 'shift' | 'offset', value: number | null) => void;
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

const DRAG_THRESHOLD = 3;
/** Экранный порог притяжения участка к краям и центрам узлов, px. */
const BEND_SNAP_PX = 6;

function displayClasses(display: TransitionDisplay): { line: string; label: string } {
  if (display === 'primary') return { line: 'flow-edge-primary', label: 'edge-label-primary' };
  if (display === 'menu') return { line: 'flow-edge-menu', label: 'edge-label-menu' };
  return { line: 'flow-edge-button', label: 'edge-label-button' };
}

/**
 * Ребро-кнопка холста: ортогональная линия с мягкими локтями между точками
 * подключения, стрелка у цели. Подпись — чип НА СВОЕЙ стрелке в доле `labelT`
 * длины; в правке тянется вдоль неё (проекция курсора на ломаную), клик —
 * выбор кнопки. Вид по показу: главная — толстая линия и залитый чип, видна —
 * сплошная, в «Ещё» — пунктир. Выделенная — тон primary, толще, кольцо чипа.
 */
export const TransitionEdge = memo(function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<TransitionFlowEdge>) {
  const name = data?.name ?? '';
  const display = data?.display ?? 'button';
  // Живое перетаскивание участка подменяет свой параметр до отпускания.
  const [bendDrag, setBendDrag] = useState<number | null>(null);
  const bendParam = useRef<'shift' | 'offset'>('shift');
  const offset =
    bendDrag !== null && bendParam.current === 'offset' ? bendDrag : (data?.offset ?? 24);
  const shift = bendDrag !== null && bendParam.current === 'shift' ? bendDrag : (data?.shift ?? 0);
  const { points, bend } = useMemo(() => {
    const ends = [
      { x: sourceX, y: sourceY },
      sideOfPosition(sourcePosition),
      { x: targetX, y: targetY },
      sideOfPosition(targetPosition),
    ] as const;
    return {
      points: orthogonalPoints(...ends, { offset, shift }),
      bend: edgeBend(...ends, { offset, shift }),
    };
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset, shift]);
  const { screenToFlowPosition, getZoom } = useReactFlow();
  const storeApi = useStoreApi();
  const [dragT, setDragT] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const classes = displayClasses(display);
  const label = pointAt(points, dragT ?? data?.labelT ?? 0.5);
  const onLabelT = data?.onLabelT;
  const tAt = (event: React.PointerEvent) =>
    projectT(points, screenToFlowPosition({ x: event.clientX, y: event.clientY }));

  // Свободный участок (#395): у выделенной стрелки в правке — широкая
  // невидимая полоса вдоль участка (курсор-ресайз) и ручка в стороне от
  // подписи; тянется поперёк, магнитится к краям и центрам узлов.
  const onBend = data?.onBend;
  const bendActive = Boolean(selected && onBend && bend);
  const bendValue = bend?.param === 'offset' ? offset : shift;
  const bendSegment = bend ? segmentOnLine(points, bend.axis, bend.lineFor(bendValue)) : null;
  const bendValueAt = (event: React.PointerEvent): number => {
    const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const axis = bend!.axis;
    const threshold = BEND_SNAP_PX / (getZoom() || 1);
    let best: { line: number; d: number } | null = null;
    for (const node of storeApi.getState().nodeLookup.values()) {
      const pos = node.internals.positionAbsolute;
      const size = axis === 'x' ? (node.measured.width ?? 0) : (node.measured.height ?? 0);
      for (const line of [pos[axis], pos[axis] + size / 2, pos[axis] + size]) {
        const d = Math.abs(line - p[axis]);
        if (d <= threshold && (!best || d < best.d)) best = { line, d };
      }
    }
    return bend!.valueFor(best ? { ...p, [axis]: best.line } : p);
  };
  const grip = (() => {
    if (!bend) return null;
    if (!bendSegment) return bend.at;
    const [a, b] = bendSegment;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const along = (k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    if (!name || length < 60) return along(0.5);
    return [0.5, 0.3, 0.7, 0.18, 0.82]
      .map(along)
      .reduce((far, c) =>
        Math.hypot(c.x - label.x, c.y - label.y) > Math.hypot(far.x - label.x, far.y - label.y)
          ? c
          : far,
      );
  })();
  const bendHandlers = {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0 || !bend) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      bendParam.current = bend.param;
      setBendDrag(bendValue);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (bendDrag === null || !bend) return;
      setBendDrag(bendValueAt(event));
    },
    onPointerUp: (event: React.PointerEvent) => {
      if (bendDrag === null || !bend) return;
      const value = bendValueAt(event);
      setBendDrag(null);
      if (value !== (bend.param === 'offset' ? data?.offset : data?.shift)) {
        onBend?.(bend.param, value);
      }
    },
    onPointerCancel: () => setBendDrag(null),
    onDoubleClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      if (bend) onBend?.(bend.param, null);
    },
  };
  const bendCursor = bend?.axis === 'x' ? 'ew-resize' : 'ns-resize';

  return (
    <>
      <BaseEdge
        id={id}
        path={roundedPath(points)}
        markerEnd={markerEnd}
        interactionWidth={18}
        className={cn(classes.line, selected && 'flow-edge-selected', data?.dim && 'opacity-40')}
      />
      {bendActive && grip ? (
        <g className="nodrag nopan" style={{ cursor: bendCursor }} {...bendHandlers}>
          {bendSegment ? (
            <path
              className="flow-bend-hit"
              d={`M ${bendSegment[0].x} ${bendSegment[0].y} L ${bendSegment[1].x} ${bendSegment[1].y}`}
            />
          ) : null}
          <rect
            className="flow-bend-grip"
            x={grip.x - (bend!.axis === 'x' ? 3 : 10)}
            y={grip.y - (bend!.axis === 'x' ? 10 : 3)}
            width={bend!.axis === 'x' ? 6 : 20}
            height={bend!.axis === 'x' ? 20 : 6}
            rx={3}
          >
            <title>{ui.automation.bendHint}</title>
          </rect>
        </g>
      ) : null}
      {name ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={cn(
              'nodrag nopan edge-label pointer-events-auto',
              classes.label,
              selected && 'edge-label-selected',
              onLabelT && 'edge-label-editable cursor-grab active:cursor-grabbing',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)`,
              opacity: data?.dim ? 0.4 : 1,
            }}
            disabled={data?.onSelect === undefined}
            title={name}
            onPointerDown={(event) => {
              if (!onLabelT || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const state = drag.current;
              if (!state) return;
              if (
                !state.moved &&
                Math.hypot(event.clientX - state.x, event.clientY - state.y) < DRAG_THRESHOLD
              ) {
                return;
              }
              state.moved = true;
              setDragT(tAt(event));
            }}
            onPointerUp={(event) => {
              const state = drag.current;
              drag.current = null;
              if (!state?.moved || !onLabelT) return;
              suppressClick.current = true;
              onLabelT(tAt(event));
              setDragT(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragT(null);
            }}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              data?.onSelect?.();
            }}
          >
            {name}
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
