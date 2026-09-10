import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { PersonalStageCreateBody, StageColor } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { cn } from '@nodus/ui/lib/utils';

import { stageColorOrder, stageTone } from '../../../shared/ui/board/stage-tone.js';

/** Создание личной колонки «Моего плана» — компактно (референс ClickUp
 *  «Add group»): маленькая ghost-кнопка в конце ряда → инлайн-форма
 *  «точка цвета + название», Enter — создать, Esc/ blur — отмена.
 *  Привязка к системному состоянию в UI не спрашивается (привязка живёт
 *  в модели данных для workflow-схем после MVP): новая колонка — «в работе». */
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

  function reset() {
    setOpen(false);
    setName('');
    setColor('neutral');
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    onCreate({ name: trimmed, color, systemState: 'active' });
    reset();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 self-start rounded-md border border-dashed border-border px-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-port/50 hover:text-foreground"
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
        {ui.tasks.addStage}
      </button>
    );
  }

  return (
    <div className="w-64 shrink-0 self-start rounded-lg border border-border bg-card p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          title={ui.tasks.stageColor}
          aria-label={ui.tasks.stageColor}
          onClick={() => {
            const next =
              stageColorOrder[(stageColorOrder.indexOf(color) + 1) % stageColorOrder.length];
            setColor(next ?? 'neutral');
          }}
          className={cn(
            'size-4 shrink-0 rounded-full transition-transform hover:scale-110',
            stageTone[color].swatch,
          )}
        />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') reset();
          }}
          onBlur={() => {
            if (!name.trim()) reset();
          }}
          placeholder={ui.tasks.stageNamePlaceholder}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="mt-2 flex gap-1.5 pl-6">
        {stageColorOrder.map((c) => (
          <button
            key={c}
            type="button"
            title={ui.tasks.stageColors[c]}
            aria-label={ui.tasks.stageColors[c]}
            onClick={() => setColor(c)}
            className={cn(
              'size-3.5 rounded-full transition-shadow',
              stageTone[c].swatch,
              color === c
                ? 'ring-2 ring-ring ring-offset-1 ring-offset-card'
                : 'opacity-50 hover:opacity-100',
            )}
          />
        ))}
      </div>
    </div>
  );
}
