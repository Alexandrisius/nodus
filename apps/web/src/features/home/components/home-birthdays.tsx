import type { BirthdayEntry } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeCard } from '@nodus/ui/components/node-card';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { formatDate } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

/** Дни рождения коллег: плоские строки, «сегодня» — активный чип. */
export function HomeBirthdays({ birthdays }: { birthdays: BirthdayEntry[] }) {
  return (
    <NodeCard label={ui.home.birthdays}>
      <div className="flex flex-col divide-y divide-border">
        {birthdays.map((entry) => (
          <div key={entry.user.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <PersonAvatar name={entry.user.displayName} className="size-9" />
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{entry.user.displayName}</div>
              <div className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground first-letter:uppercase">
                {entry.isToday ? ui.home.today : formatDate(entry.birthDate)}
              </div>
            </div>
            {entry.isToday && (
              <NodeChip tone="active" className="ml-auto">
                {ui.home.today}
              </NodeChip>
            )}
          </div>
        ))}
      </div>
    </NodeCard>
  );
}
