import { orthPath, snapPx } from '@nodus/ui/components/node-edge';

import { LEADING_COL_W } from '../../../../shared/views/row-menu.js';
import { uiPx } from '../../../../shared/ui/ui-scale.js';

/** Геометрия колонки графа структуры — та же грамматика, что у дерева
 *  задач (`task-list-graph`): порт уровня d на x = 14 + d·16, локти r=6,
 *  высота строки 48 (дизайн-px). */
export const structureGraphX = (depth: number) => uiPx(14 + depth * 16);
export const structureGraphWidth = (maxDepth: number) => structureGraphX(maxDepth) + uiPx(24);
export const STRUCTURE_ROW_H = uiPx(48);
const MID = STRUCTURE_ROW_H / 2;
const ELBOW = 6;
const PORT_GAP = 8;
const LEAF_GAP = 3;
/** X начала колонки графа внутри строки: px-4 (16) + ведущая колонка + gap-3. */
const GRAPH_LEFT = uiPx(16) + LEADING_COL_W + uiPx(12);

const midY = (index: number) => index * STRUCTURE_ROW_H + MID;

/** Строка графа: узел или задача (секция «Без узла» сюда не попадает). */
export interface StructureGraphRow {
  key: string;
  depth: number;
  hasChildren: boolean;
}

interface Edge {
  d: string;
  delayIndex: number;
}

/**
 * Контур вложенности структуры — единый SVG-оверлей поверх строк (как в
 * дереве задач): ствол ветки рисуется один раз, отводы — Т-стыками, у
 * листьев — порт r=3. Каскадная отрисовка при раскрытии — та же, что в
 * `TaskListTree`.
 */
export function StructureTreeGraph({
  rows,
  width,
  revealBase,
  revealKey,
}: {
  rows: StructureGraphRow[];
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

    const px = snapPx(structureGraphX(row.depth));
    const top = snapPx(midY(index) + PORT_GAP);
    const lastIndex = children[children.length - 1] ?? index;
    const lastRow = rows[lastIndex];
    if (!lastRow) return;
    const lastCy = snapPx(midY(lastIndex));
    const lastStop = lastRow.hasChildren ? PORT_GAP : LEAF_GAP;
    const lastCx = snapPx(structureGraphX(lastRow.depth) - lastStop);

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
      const cx = snapPx(structureGraphX(child.depth) - stop);
      edges.push({ d: `M${px},${cy} L${cx},${cy}`, delayIndex: childIndex });
    }
  });

  const height = rows.length * STRUCTURE_ROW_H;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute top-0 text-edge"
      style={{ left: GRAPH_LEFT }}
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
            key={row.key}
            cx={snapPx(structureGraphX(row.depth))}
            cy={snapPx(midY(index))}
            r={3}
            className="fill-port/60"
          />
        ),
      )}
    </svg>
  );
}
