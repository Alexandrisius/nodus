import { Cake } from 'lucide-react';
import type { BirthdayEntry } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

/** Дни рождения коллег: компактная карточка на главной. */
export function HomeBirthdays({ birthdays }: { birthdays: BirthdayEntry[] }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-lg shadow-black/20">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-lg bg-pink-400/15 text-pink-500">
          <Cake className="size-4" />
        </span>
        {ui.home.birthdays}
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {birthdays.map((entry) => (
          <div key={entry.user.id} className="flex items-center gap-3">
            <PersonAvatar name={entry.user.displayName} className="size-9" />
            <div className="text-sm">
              <div className="font-medium">{entry.user.displayName}</div>
              <div className="text-xs text-muted-foreground">
                {entry.isToday ? ui.home.today : formatDate(entry.birthDate)}
              </div>
            </div>
            {entry.isToday && (
              <span className="ml-auto rounded-full bg-pink-400/15 px-2 py-0.5 text-xs font-medium text-pink-500">
                {ui.home.today}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
