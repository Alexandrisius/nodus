import { memo, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { TransitionDisplay } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { orthogonalPoints, pointAt, projectT, roundedPath } from './edge-geometry.js';
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
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

const DRAG_THRESHOLD = 3;

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
  const offset = data?.offset ?? 24;
  const shift = data?.shift ?? 0;
  const points = useMemo(
    () =>
      orthogonalPoints(
        { x: sourceX, y: sourceY },
        sideOfPosition(sourcePosition),
        { x: targetX, y: targetY },
        sideOfPosition(targetPosition),
        { offset, shift },
      ),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset, shift],
  );
  const { screenToFlowPosition } = useReactFlow();
  const [dragT, setDragT] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const classes = displayClasses(display);
  const label = pointAt(points, dragT ?? data?.labelT ?? 0.5);
  const onLabelT = data?.onLabelT;
  const tAt = (event: React.PointerEvent) =>
    projectT(points, screenToFlowPosition({ x: event.clientX, y: event.clientY }));

  return (
    <>
      <BaseEdge
        id={id}
        path={roundedPath(points)}
        markerEnd={markerEnd}
        interactionWidth={18}
        className={cn(classes.line, selected && 'flow-edge-selected', data?.dim && 'opacity-40')}
      />
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
