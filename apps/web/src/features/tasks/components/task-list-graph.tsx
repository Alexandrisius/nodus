import { orthPath } from '@nodus/ui/components/node-edge';

import type { TaskRow } from '../lib/task-tree.js';

/** Геометрия колонки графа: порт уровня d на x = 14 + d·16, локти r=6. */
export const GRAPH_X = (depth: number) => 14 + depth * 16;
export const GRAPH_WIDTH = 54;
const ROW_H = 48;
const MID = ROW_H / 2;
const ELBOW = 6;

/**
 * Граф вложенности строки списка — фирменная «плата» задач: сквозные
 * вертикали предков, локоть к порту строки, вертикаль вниз к детям.
 * Порт родителя — кнопка сворачивания ветки («−» развёрнута, «+» свёрнута,
 * как папки в проводнике). Локоть отрисовывается каскадом при появлении;
 * при ховере на строку её сегмент загорается (currentColor + классы строки).
 */
export function TaskListGraph({
  row,
  index,
  branchCollapsed,
}: {
  row: TaskRow;
  index: number;
  branchCollapsed: boolean;
}) {
  const x = GRAPH_X(row.depth);
  const branchOpen = row.hasChildren && !branchCollapsed;
  const staticPaths: string[] = row.passThrough.map(
    (d) => `M${GRAPH_X(d)},0 L${GRAPH_X(d)},${ROW_H}`,
  );
  if (row.elbowFrom !== null && !row.isLast) {
    staticPaths.push(`M${GRAPH_X(row.elbowFrom)},${MID} L${GRAPH_X(row.elbowFrom)},${ROW_H}`);
  }
  if (branchOpen) staticPaths.push(`M${x},${MID} L${x},${ROW_H}`);

  const elbowPath =
    row.elbowFrom !== null
      ? orthPath(
          [
            { x: GRAPH_X(row.elbowFrom), y: 0 },
            { x: GRAPH_X(row.elbowFrom), y: MID },
            { x, y: MID },
          ],
          ELBOW,
        )
      : null;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${GRAPH_WIDTH} ${ROW_H}`}
      className="h-full w-full text-edge transition-colors duration-200 group-hover/row:text-foreground/80"
    >
      {staticPaths.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={1} />
      ))}
      {elbowPath ? (
        <path
          d={elbowPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          pathLength={1}
          className="node-edge-draw"
          style={{ animationDelay: `${index * 30}ms`, animationDuration: '0.35s' }}
        />
      ) : null}
      {row.hasChildren ? (
        <g className="text-port/70 transition-colors duration-200 group-hover/row:text-port">
          <circle cx={x} cy={MID} r={7} fill="var(--card)" stroke="currentColor" strokeWidth={1} />
          <path
            d={
              branchCollapsed
                ? `M${x - 3},${MID} L${x + 3},${MID} M${x},${MID - 3} L${x},${MID + 3}`
                : `M${x - 3},${MID} L${x + 3},${MID}`
            }
            stroke="currentColor"
            strokeWidth={1.25}
          />
        </g>
      ) : (
        <circle
          cx={x}
          cy={MID}
          r={3}
          fill="currentColor"
          className="text-port/60 transition-colors duration-200 group-hover/row:text-port"
        />
      )}
    </svg>
  );
}
