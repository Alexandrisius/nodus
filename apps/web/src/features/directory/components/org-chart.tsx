import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UserListItem } from '@nodus/contracts';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

interface NodePos {
  x: number;
  y: number;
  h: number;
}

/** Оргструктура: бумажные карточки по уровням и строгие ортогональные связи
 * (вниз до середины зазора, горизонталь до оси ребёнка, вниз к карточке). */
export function OrgChart({ people }: { people: UserListItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [edges, setEdges] = useState<Array<{ d: string; key: string }>>([]);

  const { levels, parentOf } = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const childrenOf = new Map<string, UserListItem[]>();
    const roots: UserListItem[] = [];
    const parents = new Map<string, string>();
    for (const person of people) {
      if (person.managerId && byId.has(person.managerId)) {
        const list = childrenOf.get(person.managerId) ?? [];
        list.push(person);
        childrenOf.set(person.managerId, list);
        parents.set(person.id, person.managerId);
      } else {
        roots.push(person);
      }
    }
    const lv: UserListItem[][] = [];
    let frontier = roots;
    while (frontier.length > 0) {
      lv.push(frontier);
      frontier = frontier.flatMap((p) => childrenOf.get(p.id) ?? []);
    }
    return { levels: lv, parentOf: parents };
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
        const managerId = parentOf.get(person.id);
        if (!managerId) continue;
        const from = pos.get(managerId);
        const to = pos.get(person.id);
        if (!from || !to) continue;
        const y0 = from.y + from.h - 2;
        const y1 = to.y + 2;
        const midY = Math.round((y0 + y1) / 2);
        const d = `M ${from.x} ${y0} V ${midY} H ${to.x} V ${y1}`;
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
  }, [people, parentOf]);

  return (
    <div ref={rootRef} className="relative flex flex-col gap-12 py-6">
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
      {levels.map((level, levelIndex) => (
        <div key={levelIndex} className="flex flex-wrap justify-center gap-8">
          {level.map((person) => (
            <div
              key={person.id}
              ref={(node) => {
                if (node) nodeRefs.current.set(person.id, node);
                else nodeRefs.current.delete(person.id);
              }}
              className="paper-card sketch-tilt flex w-48 items-center gap-3 px-3.5 py-3"
            >
              <PersonAvatar name={person.displayName} className="size-9" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{person.displayName}</div>
                <div className="truncate text-xs text-card-foreground/60">
                  {person.positionName}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
