import { ListChecks, Timer } from 'lucide-react';
import { useState } from 'react';
import type { CreationChip } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';

import { formatDuration, parseDuration } from '../lib/minutes.js';
import { TaskChecklistSheet, type DraftChecklistItem } from './task-checklist-sheet.js';
import type { TaskCreateDraft } from './task-create-draft.js';

/**
 * Чипы-блоки внизу окна создания (#432, Р2): «Чек-лист» (лист поверх формы —
 * модель Битрикс24) и «Планируемое время» (ввод деловой длительности).
 * Включаются настройкой типа; чип без значения — приглушён, со значением —
 * счётчик или «План: 2ч 30м».
 */
export function TaskCreateChips({
  chips,
  draft,
  onChange,
  preview = false,
}: {
  chips: readonly CreationChip[];
  draft: TaskCreateDraft;
  onChange: (draft: TaskCreateDraft) => void;
  preview?: boolean;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [plannedOpen, setPlannedOpen] = useState(false);
  if (chips.length === 0) return null;

  const hoursShort = ui.tasks.hoursShort;
  const minutesShort = ui.tasks.minutesShort;
  const planned =
    draft.plannedMinutes !== null
      ? formatDuration(draft.plannedMinutes, hoursShort, minutesShort)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.includes('checklist') ? (
        <button
          type="button"
          disabled={preview}
          onClick={() => setChecklistOpen(true)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm transition-colors',
            draft.checklist.length > 0
              ? 'text-foreground hover:bg-accent'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <ListChecks className="size-3.5" strokeWidth={1.75} />
          {draft.checklist.length > 0 ? (
            <span className="font-mono text-label-sm tabular-nums">{draft.checklist.length}</span>
          ) : null}
          {ui.taskCreate.chips.checklist}
        </button>
      ) : null}

      {chips.includes('planned') ? (
        plannedOpen && !preview ? (
          <PlannedInput
            value={draft.plannedMinutes}
            onCommit={(minutes) => {
              onChange({ ...draft, plannedMinutes: minutes });
              setPlannedOpen(false);
            }}
            onCancel={() => setPlannedOpen(false)}
          />
        ) : (
          <button
            type="button"
            disabled={preview}
            onClick={() => setPlannedOpen(true)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm transition-colors',
              planned
                ? 'text-foreground hover:bg-accent'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Timer className="size-3.5" strokeWidth={1.75} />
            {planned ? (
              <span className="font-mono text-label-sm tabular-nums">{planned}</span>
            ) : null}
            {ui.taskCreate.chips.planned}
          </button>
        )
      ) : null}

      {checklistOpen ? (
        <TaskChecklistSheet
          items={draft.checklist}
          onChange={(items: DraftChecklistItem[]) => onChange({ ...draft, checklist: items })}
          onClose={() => setChecklistOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Ввод планового времени: деловая длительность, Enter — сохранить, Esc — отмена. */
function PlannedInput({
  value,
  onCommit,
  onCancel,
}: {
  value: number | null;
  onCommit: (minutes: number | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    value !== null ? formatDuration(value, ui.tasks.hoursShort, ui.tasks.minutesShort) : '',
  );
  const commit = () => {
    const minutes = parseDuration(text);
    onCommit(minutes);
  };
  return (
    <Input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      placeholder={ui.tasks.plannedPlaceholder}
      aria-label={ui.tasks.plannedTime}
      className="h-8 w-40 font-mono text-label-sm"
    />
  );
}
