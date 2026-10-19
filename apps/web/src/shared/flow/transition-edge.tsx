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

import { displayEdgeStyle } from './edge-routing.js';

/** Данные ребра-кнопки (подпись = название кнопки, вид — по показу). */
export interface TransitionEdgeData extends Record<string, unknown> {
  name: string;
  display: TransitionDisplay;
  /** Дополнительный вынос U/C-обхода (edge-routing). */
  offset: number;
  /** Смещение подписи параллельных рёбер. */
  labelShift: number;
  /** Приглушение («Схема маршрута»: кнопка недоступна пользователю). */
  dim?: boolean;
  onSelect?: () => void;
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

/**
 * Ребро-кнопка холста: ортогональная линия (smoothstep, локти 8px, 1px
 * токен связи) со стрелкой у цели; подпись — чип по центру, вид по показу
 * (главная — залитый, видна — карточка с рамкой, в «Ещё» — пунктир).
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
  const d = data ?? { name: '', display: 'button' as TransitionDisplay, offset: 0, labelShift: 0 };
  const style = displayEdgeStyle(d.display);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: d.offset,
  });
  const opacity = d.dim ? 0.4 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ strokeDasharray: style.dashed ? '4 3' : undefined, opacity }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={cn(
            'nodrag nopan edge-label pointer-events-auto',
            style.labelClass,
            selected && 'drop-shadow-(--glow)',
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX + d.labelShift}px, ${labelY}px)`,
            opacity,
          }}
          onClick={d.onSelect}
          disabled={d.onSelect === undefined}
          title={d.name}
        >
          {d.name}
        </button>
      </EdgeLabelRenderer>
    </>
  );
});
