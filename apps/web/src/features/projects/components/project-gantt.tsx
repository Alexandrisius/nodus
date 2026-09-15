import { useMemo } from 'react';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { stageTone } from '../../../shared/ui/board/stage-tone.js';
import { useProjectTaskPages } from '../api/projects-api.js';

const DAY_W = 30;
const TITLE_W = 240;
const DAY_MS = 86_400_000;
/** Окно шкалы: запас до первого бара и после последнего дедлайна. */
const PAD_BEFORE = 2;
const PAD_AFTER = 5;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Длительность бара — детерминированная от id (витрина: у TaskListItem
 *  нет даты старта; контракту нужны startDate/plannedMinutes — находка,
 *  зафиксирована в issue #4). */
function syntheticDurationDays(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash + ch.charCodeAt(0)) % 997;
  return 3 + (hash % 8);
}

interface GanttRow {
  task: TaskListItem;
  startDay: number;
  endDay: number;
  overdue: boolean;
}

const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

/**
 * Вкладка «Гант» карточки проекта — ВИТРИНА будущего модуля (вердикт
 * владельца 2026-09-11, раунд 3: показать, как будет выглядеть): дневная
 * шкала, бары задач в тоне стадии (красным — просроченные), линия
 * «Сегодня» цветом порта. Даты окончания — реальные дедлайны задач;
 * длительности синтетические (см. syntheticDurationDays). Полноценный Гант
 * (зависимости, критический путь, перетаскивание сроков) — issue #39.
 */
export function ProjectGantt({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectTaskPages(projectId);

  const model = useMemo(() => {
    const today = startOfDay(Date.now());
    const items = (data?.pages.flatMap((p) => p.items) ?? []).filter((t) => t.deadline);
    if (items.length === 0)
      return { rows: [] as GanttRow[], days: [] as number[], today, firstDay: today };
    const rows: GanttRow[] = items
      .map((task) => {
        const endDay = startOfDay(new Date(task.deadline ?? 0).getTime());
        const duration = syntheticDurationDays(task.id);
        const done = task.stage.systemState === 'done' || task.stage.systemState === 'closed';
        return {
          task,
          startDay: endDay - duration * DAY_MS,
          endDay,
          overdue: !done && endDay < today,
        };
      })
      .sort((a, b) => a.endDay - b.endDay);
    const minDay = Math.min(...rows.map((r) => r.startDay)) - PAD_BEFORE * DAY_MS;
    const maxDay = Math.max(...rows.map((r) => r.endDay)) + PAD_AFTER * DAY_MS;
    const days: number[] = [];
    for (let d = minDay; d <= maxDay; d += DAY_MS) days.push(d);
    return { rows, days, today, firstDay: minDay };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (model.rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyTitle>{ui.projects.ganttEmpty}</EmptyTitle>
        </Empty>
      </div>
    );
  }

  const chartW = model.days.length * DAY_W;
  const todayX = ((model.today - model.firstDay) / DAY_MS) * DAY_W;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="w-max min-w-full">
        {/* Шкала: месяцы (на границах) + дни; колонка названий sticky. */}
        <div className="flex border-b border-border">
          <div className="sticky left-0 z-10 shrink-0 bg-card" style={{ width: TITLE_W }} />
          <div className="relative" style={{ width: chartW }}>
            <div className="flex">
              {model.days.map((day, i) => {
                const date = new Date(day);
                const prev = model.days[i - 1];
                const monthStart =
                  i === 0 || (prev !== undefined && new Date(prev).getMonth() !== date.getMonth());
                return (
                  <span
                    key={day}
                    className="block shrink-0 font-mono text-[9px] text-muted-foreground uppercase"
                    style={{ width: DAY_W }}
                  >
                    {monthStart ? monthFmt.format(date) : ''}
                  </span>
                );
              })}
            </div>
            <div className="flex">
              {model.days.map((day) => {
                const date = new Date(day);
                const weekend = date.getDay() === 0 || date.getDay() === 6;
                const isToday = day === model.today;
                return (
                  <span
                    key={day}
                    className={cn(
                      'block shrink-0 text-center font-mono text-[10px] tabular-nums',
                      isToday
                        ? 'font-semibold text-port'
                        : weekend
                          ? 'text-muted-foreground/50'
                          : 'text-muted-foreground',
                    )}
                    style={{ width: DAY_W }}
                  >
                    {date.getDate()}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Строки задач: название (sticky) + бар в тоне стадии; линия
            «Сегодня» — вертикаль порта через всю диаграмму. */}
        <div className="relative">
          <div
            aria-hidden
            title={ui.projects.ganttToday}
            className="absolute top-0 bottom-0 z-10 w-px bg-port/70"
            style={{ left: TITLE_W + todayX + DAY_W / 2 }}
          />
          {model.rows.map(({ task, startDay, endDay, overdue }) => (
            <div key={task.id} className="group flex h-10 items-center border-b border-border/50">
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-2 self-stretch bg-card pr-3 group-hover:bg-accent/40"
                style={{ width: TITLE_W }}
              >
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {task.number}
                </span>
                <span className="truncate text-sm">{task.title}</span>
              </div>
              <div className="relative self-stretch" style={{ width: chartW }}>
                <div
                  className={cn(
                    'absolute top-1/2 h-4 -translate-y-1/2 rounded-full',
                    overdue ? stageTone.danger.dot : stageTone[task.stage.color].dot,
                    (task.stage.systemState === 'done' || task.stage.systemState === 'closed') &&
                      'opacity-45',
                  )}
                  style={{
                    left: ((startDay - model.firstDay) / DAY_MS) * DAY_W,
                    width: ((endDay - startDay) / DAY_MS) * DAY_W + DAY_W,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
