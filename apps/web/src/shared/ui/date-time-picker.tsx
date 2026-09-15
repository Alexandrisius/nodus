import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import {
  monthGridCells,
  parseTime,
  quickOptionDate,
  type QuickOptionId,
} from './date-time-grid.js';

const dayMonthFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const monthYearFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const weekdayDayFmt = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const QUICK: { id: QuickOptionId; label: string }[] = [
  { id: 'today', label: ui.common.dateToday },
  { id: 'tomorrow', label: ui.common.dateTomorrow },
  { id: 'endOfWeek', label: ui.common.dateEndOfWeek },
  { id: 'inAWeek', label: ui.common.dateInAWeek },
  { id: 'endOfMonth', label: ui.common.dateEndOfMonth },
];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Выбор даты-времени крайнего срока в стиле Nodus (вердикт владельца
 * 15.09.2026: нативный `datetime-local` — «ужас из 2000-х», не в нашем
 * стиле). Модель Битрикс24: триггер-поле → поповер с сеткой месяца,
 * колонкой быстрых вариантов (Сегодня/Завтра/В конце недели/…) и полем
 * времени (дефолт 17:00 — конец рабочего дня). Логика сетки — чистая
 * `date-time-grid.ts` (unit-тесты). Потребитель: экспресс-форма задачи
 * (`shared/tasks`), далее — все формы со сроками.
 */
export function DateTimePicker({
  value,
  onChange,
  ariaLabel,
  placeholder = ui.common.noDeadline,
}: {
  value: Date | null;
  onChange: (value: Date | null) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // «Сейчас» — на момент открытия поповера (подсветка today, быстрые варианты).
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [timeStr, setTimeStr] = useState('17:00');

  // При каждом открытии — вид на месяц значения (или текущий), время значения.
  useEffect(() => {
    if (open) {
      setNow(new Date());
      const base = value ?? new Date();
      setView({ year: base.getFullYear(), month: base.getMonth() });
      setTimeStr(
        value
          ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
          : '17:00',
      );
    }
  }, [open, value]);

  const cells = useMemo(() => monthGridCells(view.year, view.month), [view]);

  function commit(day: Date) {
    const time = parseTime(timeStr) ?? { hours: 17, minutes: 0 };
    onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const next = new Date(v.year, v.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-accent/40 dark:bg-input/30"
        >
          <Calendar className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span
            className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-muted-foreground')}
          >
            {value ? `${dayMonthFmt.format(value)} ${timeStr}` : placeholder}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={ui.filters.reset}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" strokeWidth={1.75} />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div className="flex gap-3">
          <div className="w-60 shrink-0">
            <div className="flex items-center justify-between pb-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="‹"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="size-4" strokeWidth={1.75} />
              </button>
              <span className="text-sm font-medium first-letter:uppercase">
                {monthYearFmt.format(new Date(view.year, view.month, 1))}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="›"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronRight className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {ui.common.weekdaysShort.map((d) => (
                <span
                  key={d}
                  className="flex h-7 items-center justify-center font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {d}
                </span>
              ))}
              {cells.map((cell) => {
                const selected = value !== null && sameDay(cell.date, value);
                const today = sameDay(cell.date, now);
                const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    onClick={() => commit(cell.date)}
                    className={cn(
                      'flex h-7 items-center justify-center rounded-md text-xs transition-colors hover:bg-accent',
                      !cell.inMonth && 'text-muted-foreground/50',
                      cell.inMonth && weekend && !selected && 'text-muted-foreground',
                      today && !selected && 'font-semibold text-primary',
                      selected && 'bg-primary text-primary-foreground hover:bg-primary',
                    )}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {ui.common.timeLabel}
              </span>
              <Input
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                aria-label={ui.common.timeLabel}
                className="h-7 w-20 text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="flex w-44 shrink-0 flex-col gap-1 border-l border-border pl-3">
            {QUICK.map((q) => {
              const date = quickOptionDate(q.id, now);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => commit(date)}
                  className="rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="block text-sm">{q.label}</span>
                  <span className="block text-[11px] text-muted-foreground first-letter:uppercase">
                    {weekdayDayFmt.format(date)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
