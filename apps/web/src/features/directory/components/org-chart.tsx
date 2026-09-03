import { useLayoutEffect, useRef, useState } from 'react';
import type { UserListItem } from '@nodus/contracts';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

interface NodePos {
  x: number;
  y: number;
}

function jitter(seed: string, salt: number): number {
  let hash = salt;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return (hash % 9) - 4;
}

/** Оргструктура: бумажные карточки по уровням и небрежные карандашные связи
 * (кривые с детерминированным «поводырём», как от руки). */
export function OrgChart({ people }: { people: UserListItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [edges, setEdges] = useState<Array<{ d: string; key: string }>>([]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map<string, UserListItem[]>();
  const roots: UserListItem[] = [];
  for (const person of people) {
    if (person.managerId && byId.has(person.managerId)) {
      const list = childrenOf.get(person.managerId) ?? [];
      list.push(person);
      childrenOf.set(person.managerId, list);
    } else {
      roots.push(person);
    }
  }

  const levels: UserListItem[][] = [];
  let frontier = roots;
  while (frontier.length > 0) {
    levels.push(frontier);
    frontier = frontier.flatMap((p) => childrenOf.get(p.id) ?? []);
  }

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
        });
      }
      const next: Array<{ d: string; key: string }> = [];
      for (const person of people) {
        if (!person.managerId) continue;
        const from = pos.get(person.managerId);
        const to = pos.get(person.id);
        const parentNode = byId.get(person.managerId);
        if (!from || !to || !parentNode) continue;
        const parentRect = nodeRefs.current.get(person.managerId)?.getBoundingClientRect();
        const y0 = from.y + (parentRect?.height ?? 0) - 4;
        const y1 = to.y + 2;
        const jx = jitter(person.id, 7);
        const d = `M ${from.x + jx} ${y0} C ${from.x + jx} ${y0 + 22}, ${to.x + jx} ${y1 - 24}, ${to.x} ${y1}`;
        next.push({ d, key: person.id });
      }
      setEdges(next);
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [people, byId]);

  return (
    <div ref={rootRef} className="relative flex flex-col gap-12 py-6">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {edges.map((edge) => (
          <path
            key={edge.key}
            d={edge.d}
            fill="none"
            stroke="var(--pencil)"
            strokeOpacity="0.55"
            strokeWidth="1.4"
            strokeDasharray="7 5"
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
              className="paper-card flex w-48 items-center gap-3 px-3.5 py-3"
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
