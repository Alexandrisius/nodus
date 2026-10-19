import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import type { ModuleGroup } from '../model/group-release.js';
import type { ChangeType, Release } from '../model/release-schema.js';

const TYPE_CHIP: Record<ChangeType, { label: string; tone: 'success' | 'info' | 'muted' }> = {
  new: { label: ui.whatsNew.typeNew, tone: 'success' },
  improved: { label: ui.whatsNew.typeImproved, tone: 'info' },
  fixed: { label: ui.whatsNew.typeFixed, tone: 'muted' },
};

/** «19 октября 2026» — дата выкатки (YYYY-MM-DD, без сдвига часового пояса). */
function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ModuleGroupBlock({ group }: { group: ModuleGroup }) {
  const Icon = group.module.icon;
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <NodeLabel label={group.module.label} count={group.items.length} />
      </h4>
      <ul className="flex flex-col gap-1.5">
        {group.items.map((item) => (
          <li key={`${item.type}:${item.title}`} className="rounded-xl bg-muted/50 px-3.5 py-3">
            <NodeChip tone={TYPE_CHIP[item.type].tone}>{TYPE_CHIP[item.type].label}</NodeChip>
            <p className="mt-2 text-body-xs font-semibold text-foreground">{item.title}</p>
            <p className="mt-0.5 text-body-xs leading-snug text-muted-foreground">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Один выпуск в панели «Что нового»: дата + версия, строка-итог, пункты по
 * модулям. Предыдущие выпуски свёрнуты — заголовок-кнопка раскрывает их.
 */
export function ReleaseSection({
  release,
  groups,
  collapsible,
}: {
  release: Release;
  groups: ModuleGroup[];
  collapsible: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsible);
  const bodyId = useId();
  const open = expanded || !collapsible;

  const heading = (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="text-body-lg font-semibold text-foreground">
        {ui.whatsNew.releaseOf} {formatReleaseDate(release.date)}
      </span>
      <span className="font-mono text-label-sm text-muted-foreground tabular-nums">
        v{release.version}
      </span>
    </span>
  );

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${formatReleaseDate(release.date)} — ${open ? ui.whatsNew.collapse : ui.whatsNew.expand}`}
            onClick={() => setExpanded((v) => !v)}
            className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent"
          >
            {heading}
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
              strokeWidth={1.75}
            />
          </button>
        ) : (
          <h3 className="flex">{heading}</h3>
        )}
        {release.summary && (
          <p className="text-body-xs leading-snug text-muted-foreground">{release.summary}</p>
        )}
      </header>
      {open && (
        <div id={bodyId} className="flex flex-col gap-5">
          {groups.map((group) => (
            <ModuleGroupBlock key={group.module.id} group={group} />
          ))}
        </div>
      )}
    </article>
  );
}
