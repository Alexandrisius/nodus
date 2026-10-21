import type { FlowPt, FlowSide } from './edge-geometry.js';
import { handleRatio, handleSide, type FlowBox, type HandleEdgeInput } from './flow-handles.js';

/**
 * Разнос стрелок холста (#378 ред. 2): U-обходы (вход и выход с одной
 * стороны) и параллельные Z одной пары. Глубина обхода, однажды
 * зафиксированная в раскладке, — закон: перестановка соседей её не меняет.
 * Новые обходы — вложением (короткий пролёт внутри) и без наложения на уже
 * стоящие; наложение проверяется по реальной геометрии (линия глубины +
 * пролёт), а не по номеру уровня.
 */

export const U_BASE = 24;
export const U_STEP = 16;
const U_MAX = 400;
const PARALLEL_STEP = 16;
/** Обходы «слиплись»: линии глубины ближе этого и пролёты перекрываются. */
const LOOP_CLEARANCE = 12;
/** Линия глубины не проходит ближе этого к чужому узлу (сквозь карточку). */
const NODE_CLEARANCE = 10;

/** U-обход: сторона, пролёт вдоль стороны и базовая линия (край узлов). */
export interface RouteLoop {
  id: string;
  side: FlowSide;
  lo: number;
  hi: number;
  base: number;
}

export type Placed = { loop: RouteLoop; offset: number };

function handlePoint(box: FlowBox, id: string): FlowPt {
  const r = handleRatio(id);
  switch (handleSide(id)) {
    case 't':
      return { x: box.x + box.w * r, y: box.y };
    case 'b':
      return { x: box.x + box.w * r, y: box.y + box.h };
    case 'l':
      return { x: box.x, y: box.y + box.h * r };
    default:
      return { x: box.x + box.w, y: box.y + box.h * r };
  }
}

function loopOf(id: string, a: FlowBox, b: FlowBox, sh: string, th: string): RouteLoop | null {
  const side = handleSide(sh);
  if (side !== handleSide(th)) return null;
  const p = handlePoint(a, sh);
  const q = handlePoint(b, th);
  const alongX = side === 't' || side === 'b';
  const [u, v] = alongX ? [p.x, q.x] : [p.y, q.y];
  const [m, n] = alongX ? [p.y, q.y] : [p.x, q.x];
  const outward = side === 'b' || side === 'r';
  return {
    id,
    side,
    lo: Math.min(u, v),
    hi: Math.max(u, v),
    base: outward ? Math.max(m, n) : Math.min(m, n),
  };
}

const depthOf = (loop: RouteLoop, offset: number) =>
  loop.side === 'b' || loop.side === 'r' ? loop.base + offset : loop.base - offset;

/** Два обхода слиплись бы: одна сторона, линии глубины рядом, пролёты
 *  перекрываются. */
export function loopsCollide(a: RouteLoop, ao: number, b: RouteLoop, bo: number): boolean {
  return (
    a.side === b.side &&
    Math.abs(depthOf(a, ao) - depthOf(b, bo)) < LOOP_CLEARANCE &&
    a.lo < b.hi + 8 &&
    b.lo < a.hi + 8
  );
}

/** Линия глубины обхода прошла бы сквозь узел (пролёт над/под карточкой). */
export function crossesNode(loop: RouteLoop, offset: number, nodes: readonly FlowBox[]): boolean {
  const depth = depthOf(loop, offset);
  const alongX = loop.side === 't' || loop.side === 'b';
  return nodes.some((n) => {
    const [lo, hi, near, far] = alongX
      ? [n.x, n.x + n.w, n.y, n.y + n.h]
      : [n.y, n.y + n.h, n.x, n.x + n.w];
    return (
      lo < loop.hi && loop.lo < hi && depth > near - NODE_CLEARANCE && depth < far + NODE_CLEARANCE
    );
  });
}

/** Первая свободная глубина от `start`: ступенями U_STEP, пока слипается с
 *  другим обходом или линия идёт сквозь узел. */
export function freeDepth(
  loop: RouteLoop,
  start: number,
  placed: readonly Placed[],
  nodes: readonly FlowBox[] = [],
): number {
  let offset = start;
  while (
    offset < U_MAX &&
    (placed.some((p) => loopsCollide(loop, offset, p.loop, p.offset)) ||
      crossesNode(loop, offset, nodes))
  ) {
    offset += U_STEP;
  }
  return offset;
}

export interface EdgeSpread {
  /** Глубина U-обхода и сдвиг излома параллельных — по id стрелки. */
  spread: Map<string, { offset: number; shift: number }>;
  /** Геометрия U-обходов. */
  loops: Map<string, RouteLoop>;
}

export function edgeSpread(
  inputs: readonly HandleEdgeInput[],
  handles: ReadonlyMap<string, { sourceHandle: string; targetHandle: string }>,
  boxes: ReadonlyMap<string, FlowBox>,
  saved: (id: string) => number | undefined,
  savedShift: (id: string) => number | undefined = () => undefined,
): EdgeSpread {
  const spread = new Map<string, { offset: number; shift: number }>();
  const loops = new Map<string, RouteLoop>();
  const pairs = new Map<string, string[]>();
  for (const input of inputs) {
    const h = handles.get(input.id);
    const a = boxes.get(input.source);
    const b = boxes.get(input.target);
    if (!h || !a || !b) continue;
    const loop = loopOf(input.id, a, b, h.sourceHandle, h.targetHandle);
    if (loop) {
      loops.set(input.id, loop);
      continue;
    }
    const sides = `${handleSide(h.sourceHandle)}|${handleSide(h.targetHandle)}`;
    const key = `${input.source}|${input.target}|${sides}`;
    pairs.set(key, [...(pairs.get(key) ?? []), input.id]);
  }
  for (const ids of pairs.values()) {
    // Сдвиг, заданный вручную (#395), — закон; остальные параллельные — авто.
    ids.forEach((id, i) =>
      spread.set(id, {
        offset: U_BASE,
        shift: savedShift(id) ?? (i - (ids.length - 1) / 2) * PARALLEL_STEP,
      }),
    );
  }

  const placed: Placed[] = [];
  const nodes = [...boxes.values()];
  for (const loop of loops.values()) {
    const offset = saved(loop.id);
    if (offset === undefined) continue;
    spread.set(loop.id, { offset, shift: 0 });
    placed.push({ loop, offset });
  }
  const fresh = [...loops.values()]
    .filter((loop) => saved(loop.id) === undefined)
    .sort((x, y) => x.hi - x.lo - (y.hi - y.lo));
  const levels = new Map<string, number>();
  for (const loop of fresh) {
    const level = fresh
      .filter((o) => levels.has(o.id) && o.side === loop.side && o.lo < loop.hi && loop.lo < o.hi)
      .reduce((max, o) => Math.max(max, levels.get(o.id)! + 1), 0);
    levels.set(loop.id, level);
    const offset = freeDepth(loop, U_BASE + U_STEP * level, placed, nodes);
    spread.set(loop.id, { offset, shift: 0 });
    placed.push({ loop, offset });
  }
  return { spread, loops };
}
