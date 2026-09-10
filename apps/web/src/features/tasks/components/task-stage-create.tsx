import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { PersonalStageCreateBody, StageColor, TaskSystemState } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { stageColorOrder, stageTone } from '../lib/stage-tone.js';

const stateOrder: TaskSystemState[] = ['backlog', 'active', 'paused', 'done'];

/** Создание личной колонки «Моего плана» (ADR-0008): имя + цвет + привязка к
 *  системному состоянию (обязательна — она делает доску живой без роботов).
 *  Раскрывается инлайн в конце ряда колонок, модалок нет. */
export function TaskStageCreate({
  onCreate,
  creating,
}: {
  onCreate: (body: PersonalStageCreateBody) => void;
  creating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<StageColor>('neutral');
  const [systemState, setSystemState] = useState<TaskSystemState>('active');

  function reset() {
    setOpen(false);
    setName('');
    setColor('neutral');
    setSystemState('active');
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    onCreate({ name: trimmed, color, systemState });
    reset();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-full w-48 shrink-0 items-start justify-start rounded-lg border border-dashed border-border px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-port/50 hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus className="size-3.5" strokeWidth={1.75} />
          {ui.tasks.addStage}
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') reset();
        }}
        placeholder={ui.tasks.stageNamePlaceholder}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-ring"
      />
      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {ui.tasks.stageColor}
        </p>
        <div className="flex gap-1.5">
          {stageColorOrder.map((c) => (
            <button
              key={c}
              type="button"
              title={ui.tasks.stageColors[c]}
              aria-label={ui.tasks.stageColors[c]}
              onClick={() => setColor(c)}
              className={cn(
                'size-5 rounded-full transition-shadow',
                stageTone[c].swatch,
                color === c
                  ? 'ring-2 ring-ring ring-offset-2 ring-offset-card'
                  : 'opacity-60 hover:opacity-100',
              )}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {ui.tasks.stageStateLabel}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {stateOrder.map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => setSystemState(state)}
              className={cn(
                'rounded-md border px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors',
                systemState === state
                  ? 'border-port/60 bg-accent text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {ui.tasks.stageStates[state]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={submit} disabled={!name.trim() || creating}>
          {ui.tasks.create}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>
          {ui.common.cancel}
        </Button>
      </div>
    </div>
  );
}
