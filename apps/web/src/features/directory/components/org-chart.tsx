import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UserListItem } from '@nodus/contracts';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

interface NodePos {
  x: number;
  y: number;
  h: number;
}

/** Оргструктура: бумажные карточки рекурсивным деревом (дети под родителем)
 * и строгие ортогональные связи со скруглёнными углами. */
export function OrgChart({ people }: { people: UserListItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [edges, setEdges] = useState<Array<{ d: string; key: string }>>([]);

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
      const next: Array<{ d: string; key: string }> = [];
      for (const person of people) {
        if (!person.managerId) continue;
        const from = pos.get(person.managerId);
        const to = pos.get(person.id);
        if (!from || !to) continue;
        const y0 = from.y + from.h - 2;
        const y1 = to.y + 2;
        const midY = Math.round((y0 + y1) / 2);
        const dx = to.x - from.x;
        let d: string;
        if (Math.abs(dx) < 1) {
          d = `M ${from.x} ${y0} V ${y1}`;
        } else {
          const s = Math.sign(dx);
          const r = Math.min(12, Math.abs(dx) / 2, midY - y0, y1 - midY);
          d = `M ${from.x} ${y0} V ${midY - r} Q ${from.x} ${midY} ${from.x + s * r} ${midY} H ${
            to.x - s * r
          } Q ${to.x} ${midY} ${to.x} ${midY + r} V ${y1}`;
        }
        next.push({ d, key: person.id });
      }
      setEdges((prev) =>
        prev.length === next.length && prev.every((e, i) => e?.d === next[i]?.d) ? prev : next,
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [people]);

  function renderPerson(person: UserListItem): React.ReactNode {
    const children = childrenOf.get(person.id) ?? [];
    return (
      <div key={person.id} className="flex flex-col items-center gap-10">
        <div
          ref={(node) => {
            if (node) nodeRefs.current.set(person.id, node);
            else nodeRefs.current.delete(person.id);
          }}
          className="paper-card sketch-tilt flex items-center gap-2.5 px-3 py-2.5"
        >
          <PersonAvatar name={person.displayName} className="size-8" />
          <div>
            <div className="text-sm font-semibold whitespace-nowrap">{person.displayName}</div>
            <div className="text-[11px] whitespace-nowrap text-card-foreground/60">
              {person.positionName}
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <div className="flex items-start gap-4">{children.map(renderPerson)}</div>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-x-auto">
      <div ref={rootRef} className="relative w-max min-w-full py-6">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {edges.map((edge) => (
            <path
              key={edge.key}
              d={edge.d}
              fill="none"
              stroke="var(--foreground)"
              strokeOpacity="0.5"
              strokeWidth="1.5"
            />
          ))}
        </svg>
        <div className="flex justify-center gap-6 px-6">{roots.map(renderPerson)}</div>
      </div>
    </div>
  );
}
