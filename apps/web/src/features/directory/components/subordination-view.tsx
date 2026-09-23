import { Locate, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { focusSubset, hiddenReportsCount } from '../lib/department-tree.js';
import { useTreeEdges, type TreeLink } from '../lib/use-tree-edges.js';

/**
 * Вид «Подчинённость» (#84): граф людей по managerId, но НЕ вся компания —
 * фокус вокруг сотрудника: цепочка руководителей ВВЕРХ + прямые подчинённые
 * ВНИЗ, раскрытие пошаговое кнопкой «+N» (ответ на «300 карточек»: граф всегда
 * локален). Дефолт фокуса — текущий пользователь. Клик по карточке — карточка
 * сотрудника в стеке (канон), «прицел» — переставить фокус на этого человека.
 * Рёбра — грамматика контура (use-tree-edges), корни множества — у кого
 * руководитель вне множества, цепочка выстраивается вертикалью сама.
 */
export function SubordinationView({ people, meId }: { people: UserListItem[]; meId: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const openCard = useOpenCard();
  const [focusId, setFocusId] = useState(meId);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const subset = useMemo(() => focusSubset(people, focusId, expanded), [people, focusId, expanded]);
  const rendered = useMemo(() => new Set(subset.map((p) => p.id)), [subset]);
  const links = useMemo(
    () =>
      subset
        .filter((p) => p.managerId !== null && rendered.has(p.managerId))
        .map((p) => ({ parent: p.managerId as string, child: p.id })) satisfies TreeLink[],
    [subset, rendered],
  );
  const roots = useMemo(
    () => subset.filter((p) => p.managerId === null || !rendered.has(p.managerId)),
    [subset, rendered],
  );
  const { segments, ports, portRadius } = useTreeEdges(rootRef, nodeRefs, links);

  function expand(id: string) {
    setExpanded((prev) => new Set(prev).add(id));
  }

  function renderPerson(person: UserListItem): React.ReactNode {
    const children = subset.filter((p) => p.managerId === person.id);
    const hidden = hiddenReportsCount(people, rendered, person.id);
    return (
      <div key={person.id} className="flex flex-col items-center gap-10">
        <div
          ref={(el) => {
            if (!el) return;
            nodeRefs.current.set(person.id, el);
            return () => {
              nodeRefs.current.delete(person.id);
            };
          }}
          className="relative"
        >
          <button
            type="button"
            onClick={(e) =>
              openCard({ kind: 'employee', id: person.id }, e.currentTarget.getBoundingClientRect())
            }
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
          <button
            type="button"
            aria-label={ui.employees.focusOnEmployee}
            title={ui.employees.focusOnEmployee}
            onClick={() => {
              setFocusId(person.id);
              setExpanded(new Set());
            }}
            className="absolute -top-2 -right-2 rounded-full border border-border bg-card p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Locate className="size-3" strokeWidth={2} />
          </button>
          {hidden > 0 && (
            <button
              type="button"
              aria-label={ui.employees.expandReports}
              onClick={() => expand(person.id)}
              className="absolute -right-2 -bottom-2 flex items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-0.5 font-mono text-label-sm text-muted-foreground tabular-nums transition-colors hover:text-foreground"
            >
              <Plus className="size-3" strokeWidth={2} />
              {hidden}
            </button>
          )}
        </div>
        {children.length > 0 && (
          <div className="flex items-start gap-4">{children.map(renderPerson)}</div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
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
            <circle key={port.key} cx={port.x} cy={port.y} r={portRadius} fill="var(--port)" />
          ))}
        </svg>
        <div className="flex justify-center gap-6 px-6">{roots.map(renderPerson)}</div>
      </div>
    </div>
  );
}
