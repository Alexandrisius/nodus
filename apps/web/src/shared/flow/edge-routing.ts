import { Position } from '@xyflow/react';
import type { TransitionDisplay } from '@nodus/contracts';

/**
 * Прокладка рёбер холста схем (#378): выбор портов и отступов по взаимному
 * положению статусов — чистая функция, форму таблицы задаёт спека:
 * вправо — правый→левый порт; возврат — низ→низ U-образно с шагом отступа;
 * вниз в колонке — низ→верх; вверх в колонке — правый→правый с C-обходом.
 */

export interface EdgeRoutePoint {
  /** Абсцисса центра порта. */
  x: number;
  band: number;
  y: number;
  /** Индекс в колонке (для стабильности параллельных рёбер). */
  index: number;
}

export interface EdgeRoute {
  sourcePosition: Position;
  targetPosition: Position;
  /** Дополнительный вынос U/C-обхода (px) — шаг 16 на каждое параллельное ребро. */
  offset: number;
}

/** Шаг отступа параллельных возвратов/подъёмов между одной парой колонок. */
export const EDGE_OFFSET_STEP = 16;

/** Порядковый номер ребра среди параллельных (same from-band → to-band). */
export function parallelIndex(
  edges: readonly { id: string; fromBand: number; toBand: number }[],
  edgeId: string,
): number {
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return 0;
  const same = edges.filter((e) => e.fromBand === edge.fromBand && e.toBand === edge.toBand);
  return Math.max(
    0,
    same.findIndex((e) => e.id === edgeId),
  );
}

/** Порты и вынос для ребра по взаимному положению источника и цели. */
export function routeEdge(from: EdgeRoutePoint, to: EdgeRoutePoint, parallel: number): EdgeRoute {
  const step = parallel * EDGE_OFFSET_STEP;

  // В колонку правее: правый порт → левый порт.
  if (to.band > from.band) {
    return { sourcePosition: Position.Right, targetPosition: Position.Left, offset: 0 };
  }
  // Возврат в колонку левее: U под узлами (низ → низ), глубина — с шагом.
  if (to.band < from.band) {
    return {
      sourcePosition: Position.Bottom,
      targetPosition: Position.Bottom,
      offset: EDGE_OFFSET_STEP + step,
    };
  }
  // Та же колонка.
  if (to.index > from.index) {
    return { sourcePosition: Position.Bottom, targetPosition: Position.Top, offset: 0 };
  }
  // Вверх по колонке: C справа, вынос — с шагом.
  return {
    sourcePosition: Position.Right,
    targetPosition: Position.Right,
    offset: EDGE_OFFSET_STEP + step,
  };
}

/** Стиль линии и подписи по показу кнопки (главная — залитый чип, видна —
 *  карточка с рамкой, в «Ещё» — пунктир и приглушённый чип). */
export function displayEdgeStyle(display: TransitionDisplay): {
  dashed: boolean;
  labelClass: string;
} {
  if (display === 'primary') return { dashed: false, labelClass: 'edge-label-primary' };
  if (display === 'button') return { dashed: false, labelClass: 'edge-label-button' };
  return { dashed: true, labelClass: 'edge-label-menu' };
}

/** Разнос подписей параллельных рёбер одной пары статусов (не слипаются):
 *  смещение вдоль линии. */
export function labelShift(parallel: number): number {
  return parallel * 14;
}
