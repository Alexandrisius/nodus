import { orthogonalPoints, pointAt, type FlowPt } from './edge-geometry.js';
import { handleRatio, handleSide, type FlowBox } from './flow-handles.js';

/**
 * Подписи кнопок на стрелках (#378 ред. 2): чистая геометрия. Путь стрелки
 * считается так же, как его рисует холст (концы — внешний край кружка точки
 * подключения), подпись — чип в доле `t` длины пути. Свободное место для
 * подписи ищется вдоль её собственной стрелки: без наезда на статусы, метки
 * и другие подписи; занято всё — место с наименьшим перекрытием.
 */

/** Радиус кружка точки подключения: конец стрелки — на его внешнем краю. */
const PORT_R = 3.5;
const LABEL_H = 22;
const LABEL_PAD = 4;
/** Кандидаты доли пути: от середины к краям симметрично, шаг 0.03 — чтобы
 *  найти место и на коротком колене стрелки между карточками. */
const CANDIDATES = [0.5].concat(
  Array.from({ length: 16 }, (_, i) => [0.5 - 0.03 * (i + 1), 0.5 + 0.03 * (i + 1)]).flat(),
);

/** Ширина чипа подписи по тексту (Onest 12px ≈ 6.6px на знак + поля). */
export function labelWidth(name: string): number {
  return Math.min(240, Math.round(name.length * 6.6) + 22);
}

/** Конец стрелки у точки подключения: середина кружка + радиус наружу. */
export function portPoint(box: FlowBox, handleId: string): FlowPt {
  const r = handleRatio(handleId);
  switch (handleSide(handleId)) {
    case 't':
      return { x: box.x + box.w * r, y: box.y - PORT_R };
    case 'b':
      return { x: box.x + box.w * r, y: box.y + box.h + PORT_R };
    case 'l':
      return { x: box.x - PORT_R, y: box.y + box.h * r };
    default:
      return { x: box.x + box.w + PORT_R, y: box.y + box.h * r };
  }
}

/** Путь стрелки между точками подключения (тот же, что рисует холст). */
export function edgePath(
  from: FlowBox,
  sourceHandle: string,
  to: FlowBox,
  targetHandle: string,
  spread: { offset: number; shift: number },
): FlowPt[] {
  return orthogonalPoints(
    portPoint(from, sourceHandle),
    handleSide(sourceHandle),
    portPoint(to, targetHandle),
    handleSide(targetHandle),
    spread,
  );
}

export function labelBoxAt(points: readonly FlowPt[], t: number, width: number): FlowBox {
  const at = pointAt(points, t);
  return { x: at.x - width / 2, y: at.y - LABEL_H / 2, w: width, h: LABEL_H };
}

function overlapArea(a: FlowBox, b: FlowBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) + LABEL_PAD - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) + LABEL_PAD - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Перекрытие подписи с препятствиями (0 — место свободно). */
export function labelCost(box: FlowBox, obstacles: readonly FlowBox[]): number {
  return obstacles.reduce((sum, o) => sum + overlapArea(box, o), 0);
}

/**
 * Доля пути для подписи: первая свободная от `start` (ближайшие к нему
 * кандидаты раньше; без `start` — от середины), иначе — с наименьшим
 * перекрытием.
 */
export function placeLabel(
  points: readonly FlowPt[],
  width: number,
  obstacles: readonly FlowBox[],
  start?: number,
): number {
  const order =
    start === undefined
      ? CANDIDATES
      : [start, ...[...CANDIDATES].sort((a, b) => Math.abs(a - start) - Math.abs(b - start))];
  let best = order[0]!;
  let bestCost = Infinity;
  for (const t of order) {
    const cost = labelCost(labelBoxAt(points, t, width), obstacles);
    if (cost === 0) return t;
    if (cost < bestCost) {
      best = t;
      bestCost = cost;
    }
  }
  return best;
}
