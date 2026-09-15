import type { OvertimeEntry } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeCard } from '@nodus/ui/components/node-card';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { chartRowTone } from '../../../shared/ui/identity-tone.js';

/** Топ по переработкам: строки с тонкой цветной шкалой (categorical-палитра:
 *  каждый ряд — свой тон, как в классических BI-дашбордах). */
export function HomeTopOvertime({ entries }: { entries: OvertimeEntry[] }) {
  const max = Math.max(...entries.map((e) => e.hours), 1);
  return (
    <NodeCard label={ui.home.topOvertime}>
      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => (
          <div key={entry.user.id} className="flex items-center gap-3">
            <PersonAvatar name={entry.user.displayName} className="size-8" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{entry.user.displayName}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {entry.hours} {ui.home.hoursShort}
                </span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-foreground/10">
                <div
                  className={`h-full rounded-full ${chartRowTone(i)}`}
                  style={{ width: `${(entry.hours / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </NodeCard>
  );
}
