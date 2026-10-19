import type { TransitionDisplay } from '@nodus/contracts';

import { ROUTE_GEOMETRY, type RouteLayoutEntry } from './route-layout.js';

/**
 * Прокладка рёбер холста маршрута (#378, реф Jira workflow editor): линии
 * НЕ пересекают карточки — прямой ход идёт через коридор между слоями,
 * подъём внутри слоя — правым обходом, возвраты и дальние ходы — нижней
 * магистралью под схемой. Подпись каждой кнопки лежит на свободном участке
 * своего же маршрута. Чистые функции с тестами.
 */

export interface RoutePoint {
  x: number;
  y: number;
}

export interface StageBox {
  entry: RouteLayoutEntry;
}

export interface RoutedTransition {
  sourceHandle: 'l' | 'r' | 't' | 'b';
  targetHandle: 'l' | 'r' | 't' | 'b';
  /** Ломаная в абсолютных координатах канвы (центры портов). */
  points: RoutePoint[];
  /** Точка подписи — на свободном участке маршрута. */
  label: RoutePoint;
}

type Rect = { x: number; y: number; w: number; h: number };

function boxOf(entry: RouteLayoutEntry): Rect {
  return { x: entry.x, y: entry.y, w: ROUTE_GEOMETRY.stageWidth, h: ROUTE_GEOMETRY.stageHeight };
}

const port = {
  r: (b: Rect): RoutePoint => ({ x: b.x + b.w, y: b.y + b.h / 2 }),
  l: (b: Rect): RoutePoint => ({ x: b.x, y: b.y + b.h / 2 }),
  b: (b: Rect): RoutePoint => ({ x: b.x + b.w / 2, y: b.y + b.h }),
  t: (b: Rect): RoutePoint => ({ x: b.x + b.w / 2, y: b.y }),
};

/** Порядковый номер ребра среди параллельных той же пары статусов
 *  (по sortOrder transitions — стабильные коридоры). */
export function parallelIndex(
  edges: readonly { id: string; fromId: string; toId: string }[],
  edgeId: string,
): number {
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return 0;
  return Math.max(
    0,
    edges.filter((e) => e.fromId === edge.fromId && e.toId === edge.toId).indexOf(edge),
  );
}

/**
 * Прокладка одного ребра. Дальние (через слой и больше) и обратные ходы —
 * нижней магистралью; соседний слой — коридором; внутри слоя — вертикаль
 * или правый обход. Параллельные рёбра расходятся шагами (свои коридоры).
 */
export function routeTransition(
  from: RouteLayoutEntry,
  to: RouteLayoutEntry,
  parallel: number,
  laneY: number,
): RoutedTransition {
  const a = boxOf(from);
  const b = boxOf(to);

  // Соседний слой вперёд: правый порт → коридор → левый порт цели.
  if (to.layer === from.layer + 1 && b.x > a.x) {
    const step = parallel * 22;
    const midX = (a.x + a.w + b.x) / 2 + step;
    const fromR = port.r(a);
    const toL = port.l(b);
    // Параллельные кнопки одной пары всегда через свой коридор (прямая
    // допустима только у единственного ребра).
    const points =
      parallel === 0 && Math.abs(fromR.y - toL.y) < 8
        ? [fromR, toL]
        : [fromR, { x: midX, y: fromR.y }, { x: midX, y: toL.y }, toL];
    return {
      sourceHandle: 'r',
      targetHandle: 'l',
      points,
      label: { x: midX, y: (fromR.y + toL.y) / 2 },
    };
  }

  // Обратные и дальние ходы: нижняя магистраль (низ → низ). Подпись — у
  // источника (читается «откуда уходит кнопка»), своя полоса на каждую
  // параллельную пару.
  if (to.layer !== from.layer) {
    const lane = laneY + parallel * ROUTE_GEOMETRY.laneStep;
    const fromB = port.b(a);
    const toB = port.b(b);
    return {
      sourceHandle: 'b',
      targetHandle: 'b',
      points: [fromB, { x: fromB.x, y: lane }, { x: toB.x, y: lane }, toB],
      label: { x: fromB.x + 64, y: lane },
    };
  }

  // Тот же слой: цель ниже — вертикально (низ → верх), параллельные
  // расходятся по горизонтали с шагом.
  if (b.y > a.y) {
    const x = a.x + a.w / 2 + parallel * 16;
    const fromB = { x, y: a.y + a.h };
    const toT = { x, y: b.y };
    return {
      sourceHandle: 'b',
      targetHandle: 't',
      points: [fromB, toT],
      label: { x, y: (fromB.y + toT.y) / 2 },
    };
  }

  // Тот же слой, цель выше: правый C-обход (правый → правый).
  const out = a.x + a.w + ROUTE_GEOMETRY.laneOffset / 2 + parallel * 20;
  const fromR = port.r(a);
  const toR = port.r(b);
  return {
    sourceHandle: 'r',
    targetHandle: 'r',
    points: [fromR, { x: out, y: fromR.y }, { x: out, y: toR.y }, toR],
    label: { x: out, y: (fromR.y + toR.y) / 2 },
  };
}

/** SVG-путь с мягкими локтями (Q в углах, радиус обрезается по соседям). */
export function roundedOrthPath(points: readonly RoutePoint[], radius = 10): string {
  if (points.length < 2) return '';
  const towards = (from: RoutePoint, to: RoutePoint, r: number): RoutePoint => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
  };
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const corner = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(
      radius,
      Math.hypot(corner.x - prev.x, corner.y - prev.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2,
    );
    const p1 = towards(corner, prev, r);
    const p2 = towards(corner, next, r);
    d += ` L ${p1.x} ${p1.y} Q ${corner.x} ${corner.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
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
