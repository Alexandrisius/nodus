import { Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { useAuthStore } from '../../../shared/auth-store.js';
import { formatDate, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import {
  useAddTimeEntry,
  useDeleteTimeEntry,
  useRunningTimer,
  useStartTimer,
  useStopTimer,
  useTimeEntries,
} from '../api/time-api.js';
import { formatDuration, parseDuration } from '../lib/minutes.js';

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** «ЧЧ:ММ:СС» идущего таймера — тикает раз в секунду только пока виден. */
export function useElapsed(startedAt: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return '';
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Таймер в баре действий (модель Битрикс24 «Начать учёт времени»): у
 *  сотрудника один таймер — запуск здесь останавливает идущий на другой
 *  задаче. Идущий таймер этой задачи — зелёный тон и живые ЧЧ:ММ:СС. */
export function TaskTimerButton({ task }: { task: TaskDetail }) {
  const { data: timer } = useRunningTimer();
  const start = useStartTimer(task.id);
  const stop = useStopTimer();
  const runningHere = timer?.task.id === task.id;
  const elapsed = useElapsed(runningHere ? timer?.startedAt : undefined);
  if (!task.access.canLogTime) return null;
  const busy = start.isPending || stop.isPending;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (runningHere ? stop.mutate() : start.mutate())}
      title={runningHere ? ui.tasks.timer.stop : ui.tasks.timer.start}
      aria-label={runningHere ? ui.tasks.timer.stop : ui.tasks.timer.start}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40',
        runningHere
          ? 'bg-success-soft text-success hover:brightness-110'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {runningHere ? (
        <Pause className="size-4" strokeWidth={1.75} />
      ) : (
        <Play className="size-4" strokeWidth={1.75} />
      )}
      {runningHere ? (
        <span className="font-mono text-label-sm tabular-nums">{elapsed}</span>
      ) : (
        <span className="font-mono text-label-sm tabular-nums">
          {formatMinutes(task.spentMinutes)}
        </span>
      )}
    </button>
  );
}

/** Поле «Затрачено»: сумма — триггер поповера учёта времени (записи с
 *  автором, ручной ввод «1ч 30м» за сегодня/вчера, удаление своих). */
export function TaskSpentField({ task }: { task: TaskDetail }) {
  const [open, setOpen] = useState(false);
  const sum = (
    <span className="font-mono text-label-sm tabular-nums">
      {formatDuration(task.spentMinutes, ui.tasks.hoursShort, ui.tasks.minutesShort)}
    </span>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild aria-label={ui.tasks.timeTitle}>
        <button
          type="button"
          className="-mx-1 inline-flex h-6 items-center rounded-md px-1 transition-colors hover:bg-accent"
        >
          {sum}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3">
        {open ? <TimeLog task={task} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function TimeLog({ task }: { task: TaskDetail }) {
  const meId = useAuthStore((s) => s.user?.id);
  const { data } = useTimeEntries(task.id);
  const add = useAddTimeEntry(task.id);
  const remove = useDeleteTimeEntry(task.id);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [daysAgo, setDaysAgo] = useState(0);
  const entries = data?.items ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    const minutes = parseDuration(amount);
    if (minutes === null || minutes > 1440) {
      toast.error(ui.tasks.minutesInvalid);
      return;
    }
    add.mutate(
      { minutes, date: isoDate(daysAgo), ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: () => {
          setAmount('');
          setComment('');
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <NodeLabel label={ui.tasks.timeTitle} />
      {task.access.canLogTime ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={ui.tasks.timeMinutesPlaceholder}
              aria-label={ui.tasks.timeAdd}
              className="h-8 w-28 font-mono text-sm"
            />
            {[ui.tasks.timeToday, ui.tasks.timeYesterday].map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setDaysAgo(i)}
                aria-pressed={daysAgo === i}
                className={cn(
                  'h-8 rounded-md px-2.5 text-sm transition-colors',
                  daysAgo === i
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={ui.tasks.timeComment}
              aria-label={ui.tasks.timeComment}
              className="h-8 text-sm"
            />
            <Button size="sm" type="submit" disabled={!amount.trim() || add.isPending}>
              {ui.tasks.timeAdd}
            </Button>
          </div>
        </form>
      ) : null}
      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{ui.tasks.timeEmpty}</p>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className="group/entry flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent/40"
            >
              <PersonAvatar
                name={e.user.displayName}
                avatarUrl={e.user.avatarUrl}
                className="size-5"
              />
              <span className="w-16 shrink-0 font-mono text-label-sm tabular-nums">
                {formatDuration(e.minutes, ui.tasks.hoursShort, ui.tasks.minutesShort)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {e.comment ?? (e.method === 'timer' ? ui.tasks.timeByTimer : '')}
              </span>
              <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                {formatDate(e.date)}
              </span>
              {e.user.id === meId ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(e.id)}
                  aria-label={ui.tasks.timeDelete}
                  title={ui.tasks.timeDelete}
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 hover:text-danger focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
