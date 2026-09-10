import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UserListItem } from '@nodus/contracts';
import { snapPx } from '@nodus/ui/components/node-edge';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

interface NodePos {
  x: number;
  y: number;
  h: number;
}

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

/**
 * Оргструктура компании по грамматике контура Nodus: узлы — плоские
 * node-панели (аватар + имя + должность), связи — ортогональные рёбра 1px
 * на токене --edge с портами r=3 у верхнего края карточки подчинённого
 * (порты — только на целевом конце, как NodeEdge ports='end').
 * КАЖДЫЙ СЕГМЕНТ — РОВНО ОДИН ШТРИХ (gotchas SVG-графа): на группу
 * «руководитель → дети» рисуются НЕпересекающиеся пути — шина (одна
 * горизонталь от первого ребёнка до последнего), ствол (одна вертикаль
 * руководителя до шины), отводы (вертикали к портам детей): наложения
 * сегментов дали бы градиент яркости из сложения полупрозрачных stroke.
 * Координаты прямых — snapPx (равномерная яркость hairline на любом зуме).
 * Клик по узлу — карточка сотрудника в стеке (shared-element из rect).
 */
export function OrgChart({ people }: { people: UserListItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [segments, setSegments] = useState<Segment[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const openCard = useOpenCard();

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [people]);

  const { roots, childrenOf } = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const children = new Map<string, UserListItem[]>();
    const rootsList: UserListItem[] = [];
    for (const person of people) {
      if (person.managerId && byId.has(person.managerId)) {
        const list = children.get(person.managerId) ?? [];
        list.push(person);
        children.set(person.managerId, list);
      } else {
        rootsList.push(person);
      }
    }
    return { roots: rootsList, childrenOf: children };
  }, [people]);

  useLayoutEffect(() => {
    function measure() {
      const root = rootRef.current;
      if (!root) return;
      const box = root.getBoundingClientRect();
      const pos = new Map<string, NodePos>();
      for (const [id, node] of nodeRefs.current) {
        const rect = node.getBoundingClientRect();
        pos.set(id, {
          x: rect.left + rect.width / 2 - box.left,
          y: rect.top - box.top,
          h: rect.height,
        });
      }
      const nextSegments: Segment[] = [];
      const nextPorts: Port[] = [];
      for (const person of people) {
        const children = childrenOf.get(person.id) ?? [];
        const from = pos.get(person.id);
        if (children.length === 0 || !from) continue;
        const childPos = children
          .map((child) => pos.get(child.id))
          .filter((p): p is NodePos => p !== undefined);
        if (childPos.length === 0) continue;
        const y0 = from.y + from.h;
        const y1 = Math.min(...childPos.map((p) => p.y));
        const trunkX = snapPx(Math.round(from.x));
        const only = childPos.length === 1 ? childPos[0] : undefined;
        if (only && Math.abs(only.x - from.x) < 1) {
          // Единственный ребёнок ровно под руководителем — одна вертикаль.
          nextSegments.push({
            key: `trunk-${person.id}`,
            d: `M ${trunkX} ${y0} V ${y1 - PORT_GAP}`,
          });
          nextPorts.push({ key: `port-${children[0]?.id ?? person.id}`, x: trunkX, y: y1 - 1 });
          continue;
        }
        const busY = snapPx(Math.round((y0 + y1) / 2));
        const xs = childPos.map((p) => Math.round(p.x));
        const firstX = snapPx(Math.min(...xs, Math.round(from.x)));
        const lastX = snapPx(Math.max(...xs, Math.round(from.x)));
        // Шина — одна горизонталь; ствол — одна вертикаль до шины.
        nextSegments.push({ key: `bus-${person.id}`, d: `M ${firstX} ${busY} H ${lastX}` });
        nextSegments.push({ key: `trunk-${person.id}`, d: `M ${trunkX} ${y0} V ${busY}` });
        // Отводы — отдельные вертикали к портам детей (T-стыки, без наложений).
        for (const child of children) {
          const to = pos.get(child.id);
          if (!to) continue;
          const x = snapPx(Math.round(to.x));
          nextSegments.push({
            key: `drop-${child.id}`,
            d: `M ${x} ${busY} V ${to.y - PORT_GAP}`,
          });
          nextPorts.push({ key: `port-${child.id}`, x, y: to.y - 1 });
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
  }, [people, childrenOf]);

  function openPerson(person: UserListItem, el: HTMLElement) {
    openCard({ kind: 'employee', id: person.id }, el.getBoundingClientRect());
  }

  function renderPerson(person: UserListItem): React.ReactNode {
    const children = childrenOf.get(person.id) ?? [];
    return (
      <div key={person.id} className="flex flex-col items-center gap-10">
        <div
          ref={(node) => {
            if (node) nodeRefs.current.set(person.id, node);
            else nodeRefs.current.delete(person.id);
          }}
        >
          <button
            type="button"
            onClick={(e) => openPerson(person, e.currentTarget)}
            className="node-panel flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:border-input"
          >
            <PersonAvatar
              name={person.displayName}
              avatarUrl={person.avatarUrl}
              className="size-8 shrink-0"
            />
            <span>
              <span className="block text-sm font-medium whitespace-nowrap">
                {person.displayName}
              </span>
              <span className="block text-xs text-muted-foreground whitespace-nowrap">
                {person.positionName ?? ''}
              </span>
            </span>
          </button>
        </div>
        {children.length > 0 && (
          <div className="flex items-start gap-4">{children.map(renderPerson)}</div>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div ref={rootRef} className="relative w-max min-w-full py-6">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {segments.map((segment) => (
            <path
              key={segment.key}
              d={segment.d}
              fill="none"
              stroke="var(--edge)"
              strokeWidth={1}
            />
          ))}
          {ports.map((port) => (
            <circle key={port.key} cx={port.x} cy={port.y} r={PORT_R} fill="var(--port)" />
          ))}
        </svg>
        <div className="flex justify-center gap-6 px-6">{roots.map(renderPerson)}</div>
      </div>
    </div>
  );
}
