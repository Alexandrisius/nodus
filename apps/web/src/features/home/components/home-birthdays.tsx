import { Cake } from 'lucide-react';
import type { BirthdayEntry } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

/** Дни рождения коллег: бумажная карточка в правой колонке ленты. */
export function HomeBirthdays({ birthdays }: { birthdays: BirthdayEntry[] }) {
  return (
    <section className="paper-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-rust/15 text-rust">
          <Cake className="size-4" />
        </span>
        {ui.home.birthdays}
      </h2>
      <div className="mt-3 flex flex-col divide-y divide-pencil/20">
        {birthdays.map((entry) => (
          <div key={entry.user.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <PersonAvatar name={entry.user.displayName} className="size-9" />
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{entry.user.displayName}</div>
              <div className="text-xs text-card-foreground/55">
                {entry.isToday ? ui.home.today : formatDate(entry.birthDate)}
              </div>
            </div>
            {entry.isToday && (
              <span className="ml-auto rounded-full bg-rust px-2 py-0.5 text-xs font-medium text-cream">
                {ui.home.today}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
