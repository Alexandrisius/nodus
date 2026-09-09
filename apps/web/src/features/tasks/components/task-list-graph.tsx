import { orthPath } from '@nodus/ui/components/node-edge';

import type { TaskRow } from '../lib/task-tree.js';

/** Геометрия колонки графа: порт уровня d на x = 14 + d·16, локти r=6. */
export const graphX = (depth: number) => 14 + depth * 16;
/** Ширина колонки графа под максимальную видимую вложенность (универсально
 *  для любой глубины: колонка растёт вместе с деревом, таблица скроллится). */
export const graphWidth = (maxDepth: number) => graphX(maxDepth) + 24;
export const ROW_H = 48;
const MID = ROW_H / 2;
const ELBOW = 6;

const midY = (index: number) => index * ROW_H + MID;

interface BranchPath {
  d: string;
  index: number;
  last: boolean;
}

/**
 * Граф вложенности списка — единый SVG-оверлей поверх строк (одна система
 * координат: стыки непрерывны, зазоров нет по построению). Ребро ветки =
 * один непрерывный путь от порта родителя вниз до уровня ребёнка и вбок к
 * его порту; у последнего ребёнка вертикаль скруглённо переходит в горизонталь
 * (локоть r=6), у остальных — Т-стык, продолжение ствола рисует путь
 * следующего сиблинга. Порты-точки листьев — здесь же; кнопки сворачивания
 * веток остаются в строках (интерактив). Построение каскадное: пути получают
 * draw-on с задержкой по индексу строки от базы раскрытия.
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
  const paths: BranchPath[] = [];

  rows.forEach((row, index) => {
    if (row.elbowFrom === null) return;
    let parentIndex = -1;
    for (let j = index - 1; j >= 0; j -= 1) {
      const candidate = rows[j];
      if (candidate && candidate.depth === row.depth - 1) {
        parentIndex = j;
        break;
      }
    }
    if (parentIndex < 0) return;
    const px = graphX(row.elbowFrom);
    const cx = graphX(row.depth);
    const py = midY(parentIndex);
    const cy = midY(index);
    paths.push({
      d: row.isLast
        ? orthPath(
            [
              { x: px, y: py },
              { x: px, y: cy },
              { x: cx, y: cy },
            ],
            ELBOW,
          )
        : `M${px},${py} L${px},${cy} L${cx},${cy}`,
      index,
      last: row.isLast,
    });
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
      {paths.map((path) => {
        const animated = path.index >= revealBase;
        return (
          <path
            key={`${revealKey}-${path.index}`}
            d={path.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            pathLength={animated ? 1 : undefined}
            className={animated ? 'node-edge-draw' : undefined}
            style={
              animated
                ? {
                    animationDelay: `${Math.min((path.index - revealBase) * 28, 700)}ms`,
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
            cx={graphX(row.depth)}
            cy={midY(index)}
            r={3}
            className="fill-port/60"
          />
        ),
      )}
    </svg>
  );
}
