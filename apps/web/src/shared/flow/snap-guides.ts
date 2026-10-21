import type { FlowBox } from './flow-handles.js';

/**
 * Направляющие выравнивания (как в Figma/Miro): перетаскиваемый узел
 * примагничивается к краям и центрам соседних узлов, когда до линии ближе
 * порога; совпавшие линии рисуются пунктиром на всю высоту/ширину
 * выровненных узлов. Чистая функция: холст подставляет порог в единицах
 * холста (экранный порог / масштаб).
 */

export interface SnapGuide {
  /** Вертикаль x = at или горизонталь y = at. */
  orientation: 'v' | 'h';
  at: number;
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

const lines = (start: number, size: number) => [start, start + size / 2, start + size];

/** Лучшее совпадение по оси: сдвиг узла и координата линии. */
function bestAxis(
  own: number[],
  others: readonly FlowBox[],
  pick: (b: FlowBox) => number[],
  threshold: number,
): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const other of others) {
    for (const target of pick(other)) {
      for (const line of own) {
        const delta = target - line;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, at: target };
        }
      }
    }
  }
  return best;
}

const EPS = 0.5;

export function snapToGuides(
  box: FlowBox,
  others: readonly FlowBox[],
  threshold: number,
): SnapResult {
  const vx = bestAxis(lines(box.x, box.w), others, (b) => lines(b.x, b.w), threshold);
  const hy = bestAxis(lines(box.y, box.h), others, (b) => lines(b.y, b.h), threshold);
  const x = box.x + (vx?.delta ?? 0);
  const y = box.y + (hy?.delta ?? 0);
  const guides: SnapGuide[] = [];
  if (vx) {
    const aligned = others.filter((b) => lines(b.x, b.w).some((l) => Math.abs(l - vx.at) < EPS));
    guides.push({
      orientation: 'v',
      at: vx.at,
      from: Math.min(y, ...aligned.map((b) => b.y)),
      to: Math.max(y + box.h, ...aligned.map((b) => b.y + b.h)),
    });
  }
  if (hy) {
    const aligned = others.filter((b) => lines(b.y, b.h).some((l) => Math.abs(l - hy.at) < EPS));
    guides.push({
      orientation: 'h',
      at: hy.at,
      from: Math.min(x, ...aligned.map((b) => b.x)),
      to: Math.max(x + box.w, ...aligned.map((b) => b.x + b.w)),
    });
  }
  return { x, y, guides };
}
