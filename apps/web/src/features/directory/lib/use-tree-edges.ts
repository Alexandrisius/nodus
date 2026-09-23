import { useLayoutEffect, useState, type RefObject } from 'react';

import { snapPx } from '@nodus/ui/components/node-edge';

/** Отступ конца отвода от края порта (порт r=3 закрывает конец линии). */
const PORT_GAP = 4;
const PORT_R = 3;

interface Segment {
  key: string;
  d: string;
}
interface Port {
  key: string;
  x: number;
  y: number;
}

export interface TreeLink {
  parent: string;
  child: string;
}

/**
 * Ортогональные рёбра дерева по грамматике контура Nodus (вынуто из OrgChart,
 * #84): на группу «узел → дети» рисуются НЕпересекающиеся пути — шина (одна
 * горизонталь от первого ребёнка до последнего), ствол (одна вертикаль узла до
 * шины), отводы (вертикали к портам детей); единственный ребёнок ровно под
 * узлом — одна вертикаль. КАЖДЫЙ СЕГМЕНТ — РОВНО ОДИН ШТИХ (gotchas SVG-графа):
 * наложения дали бы градиент яркости из сложения полупрозрачных stroke.
 * Координаты — snapPx (равномерная яркость hairline на любом зуме); порты r=3
 * только на целевом конце. Замер — по фактическим rect узлов (ResizeObserver):
 * рендерятся только раскрытые узлы, рёбра следуют за видимым деревом.
 */
export function useTreeEdges(
  rootRef: RefObject<HTMLDivElement | null>,
  nodeRefs: RefObject<Map<string, HTMLElement>>,
  links: TreeLink[],
): { segments: Segment[]; ports: Port[]; portRadius: number } {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);

  useLayoutEffect(() => {
    function measure() {
      const root = rootRef.current;
      if (!root) return;
      const box = root.getBoundingClientRect();
      const pos = new Map<string, { x: number; y: number; h: number }>();
      for (const [id, node] of nodeRefs.current ?? []) {
        const rect = node.getBoundingClientRect();
        pos.set(id, {
          x: rect.left + rect.width / 2 - box.left,
          y: rect.top - box.top,
          h: rect.height,
        });
      }
      const childrenOf = new Map<string, string[]>();
      for (const link of links) {
        const list = childrenOf.get(link.parent) ?? [];
        list.push(link.child);
        childrenOf.set(link.parent, list);
      }
      const nextSegments: Segment[] = [];
      const nextPorts: Port[] = [];
      for (const [parentId, childIds] of childrenOf) {
        const from = pos.get(parentId);
        const childPos = childIds
          .map((id) => pos.get(id))
          .filter((p): p is { x: number; y: number; h: number } => p !== undefined);
        if (!from || childPos.length === 0) continue;
        const y0 = from.y + from.h;
        const y1 = Math.min(...childPos.map((p) => p.y));
        const trunkX = snapPx(Math.round(from.x));
        const only = childPos.length === 1 ? childPos[0] : undefined;
        if (only && Math.abs(only.x - from.x) < 1) {
          nextSegments.push({
            key: `trunk-${parentId}`,
            d: `M ${trunkX} ${y0} V ${y1 - PORT_GAP}`,
          });
          nextPorts.push({ key: `port-${childIds[0]}`, x: trunkX, y: y1 - 1 });
          continue;
        }
        const busY = snapPx(Math.round((y0 + y1) / 2));
        const xs = childPos.map((p) => Math.round(p.x));
        const firstX = snapPx(Math.min(...xs, Math.round(from.x)));
        const lastX = snapPx(Math.max(...xs, Math.round(from.x)));
        nextSegments.push({ key: `bus-${parentId}`, d: `M ${firstX} ${busY} H ${lastX}` });
        nextSegments.push({ key: `trunk-${parentId}`, d: `M ${trunkX} ${y0} V ${busY}` });
        for (const childId of childIds) {
          const to = pos.get(childId);
          if (!to) continue;
          const x = snapPx(Math.round(to.x));
          nextSegments.push({ key: `drop-${childId}`, d: `M ${x} ${busY} V ${to.y - PORT_GAP}` });
          nextPorts.push({ key: `port-${childId}`, x, y: to.y - 1 });
        }
      }
      setSegments((prev) =>
        prev.length === nextSegments.length && prev.every((s, i) => s.d === nextSegments[i]?.d)
          ? prev
          : nextSegments,
      );
      setPorts((prev) =>
        prev.length === nextPorts.length &&
        prev.every((p, i) => p.x === nextPorts[i]?.x && p.y === nextPorts[i]?.y)
          ? prev
          : nextPorts,
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [links, nodeRefs, rootRef]);

  return { segments, ports, portRadius: PORT_R };
}
