import type { TaskListItem } from '@nodus/contracts';

import { cn } from '@nodus/ui/lib/utils';

import { formatDate } from '../../../shared/lib/format.js';

const DAY = 86_400_000;

const stateTone: Record<string, string> = {
  backlog: 'bg-sky-400',
  active: 'bg-amber-400',
  paused: 'bg-slate-400',
  done: 'bg-emerald-400',
  closed: 'bg-slate-400',
};

/** Простой гант проекта: полосы задач по крайним срокам и маркер «сегодня». */
export function ProjectGantt({ tasks }: { tasks: TaskListItem[] }) {
  const now = Date.now();
  const ends = tasks.map((t) => (t.deadline ? Date.parse(t.deadline) : now));
  const min = Math.min(now, ...ends) - 7 * DAY;
  const max = Math.max(now, ...ends) + 7 * DAY;
  const span = max - min;
  const pct = (time: number) => ((time - min) / span) * 100;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex gap-3">
        <div className="flex w-64 shrink-0 flex-col gap-2">
          {tasks.map((task) => (
            <span key={task.id} className="flex h-6 items-center truncate text-sm">
              {task.title}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-rose-400"
            style={{ left: `${pct(now)}%` }}
          />
          <div className="flex flex-col gap-2">
            {tasks.map((task) => {
              const end = task.deadline ? Date.parse(task.deadline) : now;
              const start = end - 6 * DAY;
              return (
                <div key={task.id} className="relative h-6 rounded bg-slate-900/5">
                  <div
                    title={`${task.title} · ${formatDate(new Date(start).toISOString())} — ${task.deadline ? formatDate(task.deadline) : ''}`}
                    className={cn(
                      'absolute inset-y-1 rounded-full opacity-80',
                      stateTone[task.stage.systemState],
                    )}
                    style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
