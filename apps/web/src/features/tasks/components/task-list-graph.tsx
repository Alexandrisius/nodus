import { orthPath, snapPx } from '@nodus/ui/components/node-edge';

import type { TaskRow } from '../lib/task-tree.js';

/** Геометрия колонки графа: порт уровня d на x = 14 + d·16, локти r=6. */
export const graphX = (depth: number) => 14 + depth * 16;
/** Ширина колонки графа под максимальную видимую вложенность (универсально
 *  для любой глубины: колонка растёт вместе с деревом, таблица скроллится). */
export const graphWidth = (maxDepth: number) => graphX(maxDepth) + 24;
export const ROW_H = 48;
const MID = ROW_H / 2;
const ELBOW = 6;
/** Отступ ребра от края кружка порта (r=7 у веток, r=3 у листьев): линии не
 *  заходят под порт и не торчат из-под него. */
const PORT_GAP = 8;
const LEAF_GAP = 3;

const midY = (index: number) => index * ROW_H + MID;

interface Edge {
  d: string;
  delayIndex: number;
}

/**
 * Граф вложенности списка — единый SVG-оверлей поверх строк (одна система
 * координат, hairline-snap). Каждое ребро рисуется РОВНО ОДИН раз: ствол ветки
 * — один путь от нижнего края кружка родителя до последнего ребёнка (со
 * скруглённым локтем в его горизонталь), отводы остальных детей — отдельные
 * горизонтали от ствола (Т-стык). Никаких накладывающихся штрихов: яркость и
 * толщина одинаковы по всей длине. Каскадное построение: ствол получает
 * draw-on по индексу родителя, отводы — по индексу ребёнка (граф прорастает
 * сверху вниз при раскрытии).
 */
export function TaskListTree({
  rows,
  width,
  revealBase,
  revealKey,
}: {
  rows: TaskRow[];
  width: number;
  revealBase: number;
  revealKey: number;
}) {
  const edges: Edge[] = [];

  rows.forEach((row, index) => {
    if (!row.hasChildren) return;
    const children: number[] = [];
    for (let j = index + 1; j < rows.length; j += 1) {
      const below = rows[j];
      if (!below || below.depth <= row.depth) break;
      if (below.depth === row.depth + 1) children.push(j);
    }
    if (children.length === 0) return;

    const px = snapPx(graphX(row.depth));
    const top = snapPx(midY(index) + PORT_GAP);
    const lastIndex = children[children.length - 1] ?? index;
    const lastRow = rows[lastIndex];
    if (!lastRow) return;
    const lastCy = snapPx(midY(lastIndex));
    const lastStop = lastRow.hasChildren ? PORT_GAP : LEAF_GAP;
    const lastCx = snapPx(graphX(lastRow.depth) - lastStop);

    edges.push({
      d: orthPath(
        [
          { x: px, y: top },
          { x: px, y: lastCy },
          { x: lastCx, y: lastCy },
        ],
        ELBOW,
      ),
      delayIndex: index,
    });

    for (const childIndex of children.slice(0, -1)) {
      const child = rows[childIndex];
      if (!child) continue;
      const cy = snapPx(midY(childIndex));
      const stop = child.hasChildren ? PORT_GAP : LEAF_GAP;
      const cx = snapPx(graphX(child.depth) - stop);
      edges.push({ d: `M${px},${cy} L${cx},${cy}`, delayIndex: childIndex });
    }
  });

  const height = rows.length * ROW_H;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute top-0 left-4 text-edge"
    >
      {edges.map((edge, i) => {
        const animated = edge.delayIndex >= revealBase;
        return (
          <path
            key={`${revealKey}-${i}`}
            d={edge.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            pathLength={animated ? 1 : undefined}
            className={animated ? 'node-edge-draw' : undefined}
            style={
              animated
                ? {
                    animationDelay: `${Math.min((edge.delayIndex - revealBase) * 28, 700)}ms`,
                    animationDuration: '0.3s',
                  }
                : undefined
            }
          />
        );
      })}
      {rows.map((row, index) =>
        row.hasChildren ? null : (
          <circle
            key={row.task.id}
            cx={snapPx(graphX(row.depth))}
            cy={snapPx(midY(index))}
            r={3}
            className="fill-port/60"
          />
        ),
      )}
    </svg>
  );
}
