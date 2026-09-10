import { ArrowRight, Check, ChevronDown, Undo2 } from 'lucide-react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { usePersonalStages, useUpdateTaskPersonalStage } from '../api/personal-stages-api.js';
import { useTaskStages, useUpdateTaskStage } from '../api/tasks-api.js';
import { stageTone } from '../lib/stage-tone.js';

const btn =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-40';
const valueChip =
  'inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded border px-1.5 font-mono text-[11px] font-medium tracking-[0.08em] transition-colors hover:brightness-125 data-[state=open]:brightness-125';

/**
 * Стадии в карточке (модель Битрикса, утверждённая владельцем):
 * — КНОПКИ ДВИЖЕНИЯ под заголовком (TaskStageControls): компактные действия
 *   процесса — «вернуть»/«вперёд» по workflow-схеме, переход в последнюю
 *   стадию = «Завершить задачу». Сейчас системные (схема концепта линейна);
 *   после MVP названия действий придут из схемы («Согласовать», «Передать
 *   задание»…, ADR-0008, issue #38) — кнопки станут переходами графа.
 * — СТАДИЯ как ПОЛЕ (TaskStageField / TaskPersonalStageField): компактный
 *   чип с выпадающим списком в инспекторе полей, возле проекта — этап
 *   развития (глобальная ось) и колонка «Моего плана» (личная ось).
 */
export function TaskStageControls({ task }: { task: TaskDetail }) {
  const { data: stages } = useTaskStages();
  const move = useUpdateTaskStage();

  if (!stages) {
    return <div className="h-7" aria-hidden />;
  }

  const idx = stages.findIndex((s) => s.id === task.stage.id);
  const prev = idx > 0 ? stages[idx - 1] : undefined;
  const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : undefined;
  const final = next !== undefined && idx === stages.length - 2;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {prev ? (
        <button
          type="button"
          disabled={move.isPending}
          title={`${ui.tasks.stageReturn}: ${prev.name}`}
          onClick={() => move.mutate({ taskId: task.id, stageId: prev.id, index: 0 })}
          className={cn(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
        >
          <Undo2 className="size-3" strokeWidth={1.75} />
          <span className="max-w-36 truncate">{prev.name}</span>
        </button>
      ) : null}
      {next ? (
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => move.mutate({ taskId: task.id, stageId: next.id, index: 0 })}
          className={cn(btn, 'bg-primary text-primary-foreground hover:bg-primary/90')}
        >
          {final ? (
            <>
              <Check className="size-3.5" strokeWidth={2} />
              {ui.tasks.stageComplete}
            </>
          ) : (
            <>
              <span className="max-w-36 truncate">{next.name}</span>
              <ArrowRight className="size-3" strokeWidth={1.75} />
            </>
          )}
        </button>
      ) : (
        <span
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
            stageTone.success.chip,
          )}
        >
          <Check className="size-3.5" strokeWidth={2} />
          {ui.tasks.stageCompleted}
        </span>
      )}
    </div>
  );
}

/** Поле «Стадия» (глобальная ось): чип текущей стадии + компактный список
 *  стадий схемы (модель поля «Стадия» у Битрикса — возле проекта). */
export function TaskStageField({ task }: { task: TaskDetail }) {
  const { data: stages } = useTaskStages();
  const move = useUpdateTaskStage();
  const tone = stageTone[task.stage.color];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={ui.tasks.fieldStage} className={cn(valueChip, tone.chip)}>
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} />
        <span className="truncate">{task.stage.name}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {stages?.map((stage) => (
          <DropdownMenuItem
            key={stage.id}
            onSelect={() => move.mutate({ taskId: task.id, stageId: stage.id, index: 0 })}
          >
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-full', stageTone[stage.color].dot)}
            />
            <span className="truncate">{stage.name}</span>
            {stage.id === task.stage.id ? (
              <Check className="ml-auto size-3.5 shrink-0 text-port" strokeWidth={2} />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Поле «Мой план» (личная ось): колонка доски самого сотрудника. */
export function TaskPersonalStageField({ task }: { task: TaskDetail }) {
  const { data: stages } = usePersonalStages();
  const move = useUpdateTaskPersonalStage();
  const personal = stages?.find((s) => s.id === task.personalStageId);
  const tone = personal ? stageTone[personal.color] : stageTone.neutral;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ui.tasks.viewKanban}
        className={cn(valueChip, tone.chip, !personal && 'border-dashed')}
      >
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} />
        <span className="truncate">{personal?.name ?? ui.common.notSet}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {stages?.map((stage) => (
          <DropdownMenuItem
            key={stage.id}
            onSelect={() => move.mutate({ taskId: task.id, personalStageId: stage.id, index: 0 })}
          >
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-full', stageTone[stage.color].dot)}
            />
            <span className="truncate">{stage.name}</span>
            {stage.id === task.personalStageId ? (
              <Check className="ml-auto size-3.5 shrink-0 text-port" strokeWidth={2} />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
