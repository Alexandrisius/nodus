import { Position } from '@xyflow/react';
import type { FlowHandleId } from '@nodus/contracts';
import { flowHandleIdSchema } from '@nodus/contracts';

import type { FlowSide } from './edge-geometry.js';

/**
 * Точки подключения статуса (#378 ред. 2, как в редакторе Трекера): по три
 * на сторону — t1..t3, r1..r3, b1..b3, l1..l3 (слоты 25/50/75 % стороны).
 * Сохранённые в раскладке точки ребра — закон; без них — авторасстановка:
 * вперёд (r → l), назад — U снизу (b → b), по вертикали — (b → t)/(t → b),
 * слоты раздаются по стороне по положению второго конца. Чистые функции.
 */

export const FLOW_HANDLE_IDS: readonly FlowHandleId[] = flowHandleIdSchema.options;

const SLOT_RATIO: Record<string, number> = { '1': 0.25, '2': 0.5, '3': 0.75 };

export const SIDE_POSITION: Record<FlowSide, Position> = {
  t: Position.Top,
  r: Position.Right,
  b: Position.Bottom,
  l: Position.Left,
};

export function sideOfPosition(position: Position): FlowSide {
  if (position === Position.Top) return 't';
  if (position === Position.Right) return 'r';
  if (position === Position.Bottom) return 'b';
  return 'l';
}

export function handleSide(id: string): FlowSide {
  const side = id.charAt(0);
  return side === 't' || side === 'r' || side === 'b' ? side : 'l';
}

/** Доля стороны, на которой стоит точка (слот 1..3 → 25/50/75 %). */
export function handleRatio(id: string): number {
  return SLOT_RATIO[id.charAt(1)] ?? 0.5;
}

export interface FlowBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 16;

function center(b: FlowBox): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Прямой ход между боксами задевает чужой бокс (коридор занят)? */
function corridorBlocked(from: FlowBox, to: FlowBox, others: readonly FlowBox[]): boolean {
  const left = from.x + from.w;
  const right = to.x;
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y + from.h, to.y + to.h);
  return others.some((o) => o.x < right && o.x + o.w > left && o.y < bottom && o.y + o.h > top);
}

/** Стороны ребра по взаимному положению статусов (без сохранённых точек). */
export function autoSides(
  from: FlowBox,
  to: FlowBox,
  others: readonly FlowBox[] = [],
): [FlowSide, FlowSide] {
  if (to.x >= from.x + from.w + GAP) {
    // Вперёд: прямо, если коридор свободен; иначе U снизу под соседями.
    return corridorBlocked(from, to, others) ? ['b', 'b'] : ['r', 'l'];
  }
  if (to.x + to.w <= from.x - GAP) return ['b', 'b'];
  return center(to).y >= center(from).y ? ['b', 't'] : ['t', 'b'];
}

/** Слоты для n концов на одной стороне: 1 → центр, 2 → края, 3+ — по порядку. */
export function slotsFor(count: number): number[] {
  if (count <= 1) return [2];
  if (count === 2) return [1, 3];
  return Array.from({ length: count }, (_, i) => 1 + Math.min(2, Math.floor((i * 3) / count)));
}

export interface HandleEdgeInput {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Точки всех рёбер: сохранённые — как есть; недостающие — сторона по
 * `autoSides`, слот — по порядку вторых концов вдоль стороны (верхний
 * сосед — к верхней точке, левый — к левой). Узлы без бокса пропускаются;
 * `isObstacle` — какие боксы занимают коридор (по умолчанию все).
 */
export function assignHandles(
  edges: readonly HandleEdgeInput[],
  boxes: ReadonlyMap<string, FlowBox>,
  isObstacle: (id: string) => boolean = () => true,
): Map<string, { sourceHandle: string; targetHandle: string }> {
  type End = {
    edgeId: string;
    end: 'source' | 'target';
    node: string;
    side: FlowSide;
    key: number;
  };
  const result = new Map<string, { sourceHandle: string; targetHandle: string }>();
  const pending: End[] = [];
  const obstacles = [...boxes.entries()].filter(([id]) => isObstacle(id));

  for (const edge of edges) {
    const from = boxes.get(edge.source);
    const to = boxes.get(edge.target);
    if (!from || !to) continue;
    const others = obstacles
      .filter(([id]) => id !== edge.source && id !== edge.target)
      .map(([, b]) => b);
    const [sSide, tSide] = autoSides(from, to, others);
    result.set(edge.id, {
      sourceHandle: edge.sourceHandle ?? `${sSide}2`,
      targetHandle: edge.targetHandle ?? `${tSide}2`,
    });
    const along = (side: FlowSide, other: FlowBox) =>
      side === 't' || side === 'b' ? center(other).x : center(other).y;
    if (!edge.sourceHandle) {
      pending.push({
        edgeId: edge.id,
        end: 'source',
        node: edge.source,
        side: sSide,
        key: along(sSide, to),
      });
    }
    if (!edge.targetHandle) {
      pending.push({
        edgeId: edge.id,
        end: 'target',
        node: edge.target,
        side: tSide,
        key: along(tSide, from),
      });
    }
  }

  const groups = new Map<string, End[]>();
  for (const end of pending) {
    const key = `${end.node}|${end.side}`;
    groups.set(key, [...(groups.get(key) ?? []), end]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.key - b.key || (a.edgeId < b.edgeId ? -1 : 1));
    const slots = slotsFor(group.length);
    group.forEach((end, i) => {
      const entry = result.get(end.edgeId)!;
      const handle = `${end.side}${slots[i]}`;
      result.set(
        end.edgeId,
        end.end === 'source'
          ? { ...entry, sourceHandle: handle }
          : { ...entry, targetHandle: handle },
      );
    });
  }
  return result;
}
