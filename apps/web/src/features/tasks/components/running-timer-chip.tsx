import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { PauseGlyph } from '../../../shared/ui/pause-glyph.js';
import { useRunningTimer, useStopTimer } from '../api/time-api.js';
import { useElapsed } from './task-time.js';

/** Идущий таймер в топбаре (#311, модель Битрикс24 «таймер в шапке»):
 *  виден из любого раздела — №задачи и ЧЧ:ММ:СС; клик — карточка задачи,
 *  пауза — остановить (минуты пишутся в задачу). Таймера нет — пусто. */
export function RunningTimerChip() {
  const { data: timer } = useRunningTimer();
  const stop = useStopTimer();
  const openCard = useOpenCard();
  const elapsed = useElapsed(timer?.startedAt);
  if (!timer) return null;

  return (
    <span className="flex h-8 shrink-0 items-center rounded-md bg-success-soft text-success">
      <button
        type="button"
        onClick={() => openCard({ kind: 'task', id: timer.task.id })}
        title={`${ui.tasks.timeTitle}: ${timer.task.title}`}
        className="flex h-full items-center gap-2 rounded-l-md pr-1 pl-2.5 transition-[filter] hover:brightness-110"
      >
        <span className="font-mono text-label-sm tabular-nums">№{timer.task.number}</span>
        <span className="font-mono text-label-sm tabular-nums">{elapsed}</span>
      </button>
      <button
        type="button"
        disabled={stop.isPending}
        onClick={() => stop.mutate()}
        aria-label={ui.tasks.timer.stop}
        title={ui.tasks.timer.stop}
        className="flex h-full items-center rounded-r-md pr-2 pl-1 transition-[filter] hover:brightness-110 disabled:opacity-50"
      >
        <PauseGlyph className="size-3.5" />
      </button>
    </span>
  );
}
