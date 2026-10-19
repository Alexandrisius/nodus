import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { TransitionDisplay } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { displayEdgeStyle, roundedOrthPath, type RoutePoint } from './edge-routing.js';

/** Данные ребра-кнопки: маршрут проложен заранее (edge-routing) — точки
 *  ломаной и координаты подписи в абсолютных координатах канвы. */
export interface TransitionEdgeData extends Record<string, unknown> {
  name: string;
  display: TransitionDisplay;
  /** Ломаная маршрута (пусто — прямая по портам, стартовое ребро). */
  points: readonly RoutePoint[];
  /** Точка подписи (пусто — подписи нет). */
  label: RoutePoint | null;
  /** Приглушение («Схема маршрута»: кнопка недоступна пользователю). */
  dim?: boolean;
  onSelect?: () => void;
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

/**
 * Ребро-кнопка холста: ортогональная линия с мягкими локтями и стрелкой у
 * цели; подпись — чип в точке, гарантированно свободной от карточек (коридор
 * между слоями или нижняя магистраль). Вид по показу: главная — залитый чип,
 * видна — карточка с рамкой, в «Ещё» — пунктир и приглушённый чип.
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
  const d = data ?? { name: '', display: 'button' as TransitionDisplay, points: [], label: null };
  const style = displayEdgeStyle(d.display);
  const path =
    d.points.length >= 2
      ? roundedOrthPath(d.points)
      : getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          borderRadius: 8,
        })[0];
  const opacity = d.dim ? 0.4 : 1;

  return (
    <>
      {/* Широкая невидимая линия — область попадания клика/ховера. */}
      <BaseEdge id={`${id}-hit`} path={path} style={{ strokeWidth: 16, stroke: 'transparent' }} />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ strokeDasharray: style.dashed ? '4 3' : undefined, opacity }}
      />
      {d.label && d.name ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={cn(
              'nodrag nopan edge-label pointer-events-auto',
              style.labelClass,
              selected && 'drop-shadow-(--glow)',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${d.label.x}px, ${d.label.y}px)`,
              opacity,
            }}
            onClick={d.onSelect}
            disabled={d.onSelect === undefined}
            title={d.name}
          >
            {d.name}
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
