/**
 * Геометрия рёбер холста (#378 ред. 2, ADR-0022) — чистые функции с тестами:
 * ортогональная ломаная между РЕАЛЬНЫМИ концами (точками подключения на
 * статусах), мягкие локти, точка на ломаной по доле длины и обратная
 * проекция — подпись кнопки стоит на своей стрелке и двигается вдоль неё.
 * Ломаная — по мотивам `getPoints` smoothstep-рёбер @xyflow/system (MIT):
 * вылет из точки на `offset` по её стороне, излом по середине для встречных
 * сторон, угол или U-обход для остальных. Общей магистрали нет: U-обходы
 * разносит `offset` (24 + 16·k), параллельные Z — `shift`.
 */

export type FlowSide = 't' | 'r' | 'b' | 'l';

export interface FlowPt {
  x: number;
  y: number;
}

export interface OrthogonalOptions {
  /** Вылет из точки по её стороне (и глубина U-обхода одной стороны). */
  offset?: number;
  /** Сдвиг середины излома встречных сторон (параллельные кнопки пары). */
  shift?: number;
  /** Обход «за спину» (цель позади источника): запас по вертикали/горизонтали. */
  clearY?: number;
  clearX?: number;
}

const DIR: Record<FlowSide, FlowPt> = {
  t: { x: 0, y: -1 },
  r: { x: 1, y: 0 },
  b: { x: 0, y: 1 },
  l: { x: -1, y: 0 },
};

const EPS = 0.5;

/** Убирает повторы и точки посреди прямого участка (лишние «локти»). */
export function simplify(points: readonly FlowPt[]): FlowPt[] {
  const unique = points.filter(
    (p, i) =>
      i === 0 || Math.abs(p.x - points[i - 1]!.x) > EPS || Math.abs(p.y - points[i - 1]!.y) > EPS,
  );
  return unique.filter((p, i) => {
    if (i === 0 || i === unique.length - 1) return true;
    const a = unique[i - 1]!;
    const b = unique[i + 1]!;
    const sameX = Math.abs(a.x - p.x) < EPS && Math.abs(p.x - b.x) < EPS;
    const sameY = Math.abs(a.y - p.y) < EPS && Math.abs(p.y - b.y) < EPS;
    return !(sameX || sameY);
  });
}

/** Излом «ступеньки» — между вылетами концов: сдвинутый участок не уходит
 *  за вылет (иначе линия шла назад петлёй, когда статусы сблизили). */
function clampMid(value: number, a: number, b: number): number {
  return Math.min(Math.max(a, b), Math.max(Math.min(a, b), value));
}

/**
 * Ортогональная ломаная от `src` (выход стороной `sSide`) к `dst` (вход
 * стороной `dSide`). Соосные встречные концы — прямая; встречные стороны —
 * Z с изломом посередине (или обход, если цель позади); одна сторона — U;
 * смешанные — угол.
 */
export function orthogonalPoints(
  src: FlowPt,
  sSide: FlowSide,
  dst: FlowPt,
  dSide: FlowSide,
  options: OrthogonalOptions = {},
): FlowPt[] {
  const offset = options.offset ?? 24;
  const shift = options.shift ?? 0;
  const sd = DIR[sSide];
  const dd = DIR[dSide];
  const horizontal = sd.x !== 0;
  const axis = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  const facing = sd[axis] * dd[axis] === -1;

  // Соосные встречные концы, цель впереди — одна прямая.
  if (facing && shift === 0 && Math.abs(src[cross] - dst[cross]) < EPS) {
    if ((dst[axis] - src[axis]) * sd[axis] > 0) return [src, dst];
  }

  const sg = { x: src.x + sd.x * offset, y: src.y + sd.y * offset };
  const tg = { x: dst.x + dd.x * offset, y: dst.y + dd.y * offset };
  const cur = sg[axis] < tg[axis] ? 1 : -1;
  let middle: FlowPt[];

  if (facing) {
    if ((tg[axis] - sg[axis]) * sd[axis] < 0) {
      // Цель позади источника: обход ниже (горизонтальные стороны) или
      // правее (вертикальные) обоих концов — линия не идёт сквозь узлы.
      if (horizontal) {
        const y = Math.max(src.y, dst.y) + (options.clearY ?? 52) + shift;
        middle = [
          { x: sg.x, y },
          { x: tg.x, y },
        ];
      } else {
        const x = Math.max(src.x, dst.x) + (options.clearX ?? 128) + shift;
        middle = [
          { x, y: sg.y },
          { x, y: tg.y },
        ];
      }
    } else if (horizontal) {
      const x = clampMid((src.x + dst.x) / 2 + shift, sg.x, tg.x);
      middle = [
        { x, y: sg.y },
        { x, y: tg.y },
      ];
    } else {
      const y = clampMid((src.y + dst.y) / 2 + shift, sg.y, tg.y);
      middle = [
        { x: sg.x, y },
        { x: tg.x, y },
      ];
    }
  } else {
    const sourceTarget = [{ x: sg.x, y: tg.y }];
    const targetSource = [{ x: tg.x, y: sg.y }];
    if (horizontal) middle = sd.x === cur ? targetSource : sourceTarget;
    else middle = sd.y === cur ? sourceTarget : targetSource;
    if (sSide === dSide) {
      // U одной стороны: глубина — от дальнего из концов.
      const depth = sd[axis] > 0 ? Math.max(sg[axis], tg[axis]) : Math.min(sg[axis], tg[axis]);
      middle = horizontal
        ? [
            { x: depth, y: sg.y },
            { x: depth, y: tg.y },
          ]
        : [
            { x: sg.x, y: depth },
            { x: tg.x, y: depth },
          ];
    } else {
      const sameDir = sd[axis] === dd[cross];
      const sGt = sg[cross] > tg[cross];
      const sLt = sg[cross] < tg[cross];
      const flip =
        (sd[axis] === 1 && ((!sameDir && sGt) || (sameDir && sLt))) ||
        (sd[axis] !== 1 && ((!sameDir && sLt) || (sameDir && sGt)));
      if (flip) middle = horizontal ? sourceTarget : targetSource;
    }
  }
  return simplify([src, sg, ...middle, tg, dst]);
}

/**
 * Свободный участок стрелки (#395) — тот, что можно отодвинуть, не меняя
 * форму: средний у «ступеньки», дальний у обхода «за спиной», линия глубины
 * у U-обхода. У «уголка» свободного участка нет (null). `at` — середина
 * участка (место ручки), `axis` — направление перетаскивания, `valueFor` —
 * новое значение параметра (`shift` или `offset`) для точки курсора, а
 * `lineFor` — координата участка по оси при этом значении.
 */
export interface EdgeBend {
  param: 'shift' | 'offset';
  axis: 'x' | 'y';
  at: FlowPt;
  valueFor: (p: FlowPt) => number;
  lineFor: (value: number) => number;
}

export const OFFSET_MIN = 12;
export const OFFSET_MAX = 400;

export function edgeBend(
  src: FlowPt,
  sSide: FlowSide,
  dst: FlowPt,
  dSide: FlowSide,
  options: OrthogonalOptions = {},
): EdgeBend | null {
  const offset = options.offset ?? 24;
  const shift = options.shift ?? 0;
  const sd = DIR[sSide];
  const dd = DIR[dSide];
  const horizontal = sd.x !== 0;
  const axis = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  const sg = { x: src.x + sd.x * offset, y: src.y + sd.y * offset };
  const tg = { x: dst.x + dd.x * offset, y: dst.y + dd.y * offset };
  const midCross = (src[cross] + dst[cross]) / 2;
  const pt = (along: number, across: number): FlowPt =>
    horizontal ? { x: along, y: across } : { x: across, y: along };

  if (sSide === dSide) {
    const out = sd[axis];
    const base = out > 0 ? Math.max(src[axis], dst[axis]) : Math.min(src[axis], dst[axis]);
    const lineFor = (value: number) => base + out * value;
    return {
      param: 'offset',
      axis,
      at: pt(lineFor(offset), midCross),
      valueFor: (p) =>
        Math.round(Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, (p[axis] - base) * out))),
      lineFor,
    };
  }
  if (sd[axis] * dd[axis] !== -1) return null;

  if ((tg[axis] - sg[axis]) * sd[axis] < 0) {
    // Обход «за спиной»: участок идёт вдоль оси сторон, двигается поперёк.
    const base = horizontal
      ? Math.max(src.y, dst.y) + (options.clearY ?? 52)
      : Math.max(src.x, dst.x) + (options.clearX ?? 128);
    const lineFor = (value: number) => base + value;
    return {
      param: 'shift',
      axis: cross,
      at: pt((sg[axis] + tg[axis]) / 2, lineFor(shift)),
      valueFor: (p) => Math.round(p[cross] - base),
      lineFor,
    };
  }

  // Прямая (соосные концы): участок вырожден — двигать нечего.
  if (Math.abs(src[cross] - dst[cross]) < EPS) return null;
  const mid = (src[axis] + dst[axis]) / 2;
  const lineFor = (value: number) => clampMid(mid + value, sg[axis], tg[axis]);
  return {
    param: 'shift',
    axis,
    at: pt(lineFor(shift), midCross),
    valueFor: (p) => Math.round(lineFor(p[axis] - mid) - mid),
    lineFor,
  };
}

/** Отрезок ломаной, лежащий на линии `line` поперёк оси `axis` (свободный
 *  участок), или null (прямая стрелка — участок вырожден). */
export function segmentOnLine(
  points: readonly FlowPt[],
  axis: 'x' | 'y',
  line: number,
): [FlowPt, FlowPt] | null {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (Math.abs(a[axis] - line) < EPS && Math.abs(b[axis] - line) < EPS) return [a, b];
  }
  return null;
}

/** SVG-путь с мягкими локтями (квадратичная кривая в углах; радиус
 *  обрезается половиной соседних отрезков — короткие участки не ломаются). */
export function roundedPath(points: readonly FlowPt[], radius = 10): string {
  if (points.length < 2) return '';
  const towards = (from: FlowPt, to: FlowPt, r: number): FlowPt => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / len) * r, y: from.y + ((to.y - from.y) / len) * r };
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
  return `${d} L ${last.x} ${last.y}`;
}

function segmentLengths(points: readonly FlowPt[]): number[] {
  return points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
}

/** Точка на ломаной по доле длины t ∈ [0, 1]. */
export function pointAt(points: readonly FlowPt[], t: number): FlowPt {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const lengths = segmentLengths(points);
  const total = lengths.reduce((sum, l) => sum + l, 0);
  let rest = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i]!;
    if (rest <= len || i === lengths.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, rest / len);
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    rest -= len;
  }
  return points[points.length - 1]!;
}

/** Доля длины ломаной в ближайшей к точке p позиции (обратная pointAt). */
export function projectT(points: readonly FlowPt[], p: FlowPt): number {
  if (points.length < 2) return 0.5;
  const lengths = segmentLengths(points);
  const total = lengths.reduce((sum, l) => sum + l, 0);
  if (total === 0) return 0.5;
  let best = { distance: Infinity, along: 0 };
  let start = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = lengths[i]!;
    const k =
      len === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len ** 2),
          );
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance < best.distance) best = { distance, along: start + len * k };
    start += len;
  }
  return best.along / total;
}
