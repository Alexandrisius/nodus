import { Flame } from 'lucide-react';
import type { OvertimeEntry } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

/** Топ по переработкам: карандашные полосы на бумаге. */
export function HomeTopOvertime({ entries }: { entries: OvertimeEntry[] }) {
  const max = Math.max(...entries.map((e) => e.hours), 1);
  return (
    <section className="paper-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-rust/15 text-rust">
          <Flame className="size-4" />
        </span>
        {ui.home.topOvertime}
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.user.id} className="flex items-center gap-3">
            <PersonAvatar name={entry.user.displayName} className="size-8" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{entry.user.displayName}</span>
                <span className="shrink-0 text-xs text-card-foreground/60 tabular-nums">
                  {entry.hours} {ui.home.hoursShort}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full border border-pencil/30 bg-cream/60">
                <div
                  className="h-full rounded-full bg-rust/70"
                  style={{ width: `${(entry.hours / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
