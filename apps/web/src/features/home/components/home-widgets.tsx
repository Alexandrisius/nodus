import { Cake, Mail, ListTodo } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { HomeSummary } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatDate } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';

function Widget({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-lg shadow-black/20">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn('flex size-7 items-center justify-center rounded-lg', tone)}>
          {icon}
        </span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Правая колонка главной: мои задачи, письма, дни рождения (рабочий кабинет). */
export function HomeWidgets({ summary }: { summary: HomeSummary }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <Widget
        icon={<ListTodo className="size-4" />}
        tone="bg-indigo-400/15 text-indigo-500"
        title={ui.home.myTasks}
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-rose-500/10 px-2 py-1.5">
            <div className="text-lg font-semibold text-rose-600">
              {summary.tasks.overdue.length}
            </div>
            <div className="text-xs text-rose-600">{ui.home.myTasksOverdue}</div>
          </div>
          <div className="rounded-lg bg-warning-soft px-2 py-1.5">
            <div className="text-lg font-semibold text-warning">{summary.tasks.today.length}</div>
            <div className="text-xs text-warning">{ui.home.myTasksToday}</div>
          </div>
          <div className="rounded-lg bg-info-soft px-2 py-1.5">
            <div className="text-lg font-semibold text-info">{summary.tasks.weekCount}</div>
            <div className="text-xs text-info">{ui.home.myTasksWeek}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {[...summary.tasks.overdue, ...summary.tasks.today].slice(0, 4).map((task) => (
            <button
              key={task.id}
              type="button"
              className="flex flex-col gap-1 rounded-lg border p-2 text-left hover:bg-accent/50"
              onClick={() => void navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })}
            >
              <span className="line-clamp-1 text-sm font-medium">{task.title}</span>
              <DeadlineChip deadline={task.deadline} />
            </button>
          ))}
        </div>
      </Widget>

      <Widget
        icon={<Mail className="size-4" />}
        tone="bg-amber-400/15 text-amber-500"
        title={ui.home.recentLetters}
      >
        {summary.letters.unregisteredCount > 0 && (
          <button
            type="button"
            className="mb-2 w-full rounded-lg bg-warning-soft px-3 py-2 text-left text-sm font-medium text-warning hover:opacity-80"
            onClick={() => void navigate({ to: '/letters', search: { folder: 'unregistered' } })}
          >
            {ui.home.lettersUnregistered}: {summary.letters.unregisteredCount}
          </button>
        )}
        <div className="flex flex-col gap-2">
          {summary.letters.recent.map((letter) => (
            <button
              key={letter.id}
              type="button"
              className="flex flex-col gap-0.5 rounded-lg border p-2 text-left hover:bg-accent/50"
              onClick={() =>
                void navigate({ to: '/letters/$letterId', params: { letterId: letter.id } })
              }
            >
              <span className="line-clamp-1 text-sm font-medium">{letter.subject}</span>
              <span className="text-xs text-muted-foreground">{letter.correspondent}</span>
            </button>
          ))}
        </div>
      </Widget>

      <Widget
        icon={<Cake className="size-4" />}
        tone="bg-pink-400/15 text-pink-500"
        title={ui.home.birthdays}
      >
        <div className="flex flex-col gap-2">
          {summary.birthdays.map((entry) => (
            <div key={entry.user.id} className="flex items-center gap-2">
              <PersonAvatar name={entry.user.displayName} className="size-8" />
              <div className="text-sm">
                <div className="font-medium">{entry.user.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  {entry.isToday ? ui.home.today : formatDate(entry.birthDate)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Widget>
    </div>
  );
}
