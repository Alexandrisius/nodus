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

import { useTaskStages, useUpdateTaskStage } from '../api/tasks-api.js';
import { stageTone } from '../lib/stage-tone.js';

const btn =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-40';
const valueChip =
  'inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded border px-1.5 font-mono text-[11px] font-medium tracking-[0.08em] transition-colors hover:brightness-125 data-[state=open]:brightness-125';

/**
 * Замоноличенный нижний бар действий задачи (модель Битрикса: бар не
 * скроллится, всегда под рукой). Логика движения (вердикт владельца):
 * — workflow-схема применена к проекту+типу: кнопки = переходы схемы
 *   (имена из схемы: «Согласовать», «Передать задание»…; после MVP, #38);
 * — workflow НЕ применён (текущий концепт, линейная схема): «⟲ назад»,
 *   «вперёд →» (постепенно по стадиям) И «Завершить задачу» в любой момент
 *   (ClickUp-логика свободной задачи); в последнюю стадию ведёт и «вперёд».
 * Личная колонка «Моего плана» здесь НЕ показывается и из карточки не
 * меняется — это визуальная организация доски, только DnD (модель Битрикса).
 */
export function TaskActionBar({ task }: { task: TaskDetail }) {
  const { data: stages } = useTaskStages();
  const move = useUpdateTaskStage();

  if (!stages) {
    return <div className="h-7" aria-hidden />;
  }

  const idx = stages.findIndex((s) => s.id === task.stage.id);
  const cur = idx >= 0 ? stages[idx] : undefined;
  const done = cur?.systemState === 'done' || cur?.systemState === 'closed';
  // Назад = «вернуть/возобновить»: ближайшая предыдущая стадия ОСНОВНОГО пути
  // (backlog/active) — из «Отложена»/«Завершена» это возврат в работу, а не
  // шаг по порядку схемы (иначе «Отложена» → «Завершена», чепуха).
  const prev =
    idx > 0
      ? [...stages.slice(0, idx)]
          .reverse()
          .find((s) => s.systemState === 'backlog' || s.systemState === 'active')
      : undefined;
  // Вперёд — следующая стадия основного пути, пропуская паузу/закрытые
  // (пауза ставится выбором стадии в поле, не кнопкой хода).
  const next =
    idx >= 0
      ? stages.slice(idx + 1).find((s) => s.systemState !== 'paused' && s.systemState !== 'closed')
      : undefined;
  const final = next?.systemState === 'done';
  // «Сразу завершить» — прыжок в первую done-стадию схемы, НЕ в последнюю
  // по порядку (в схеме после «Завершена» может стоять «Отложена» и т.п.).
  const doneStage = stages.find((s) => s.systemState === 'done');

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
      ) : null}
      {/* Свободная задача (без workflow): «сразу завершить» доступно всегда,
          пока до финала больше одного шага; иначе финал делает «вперёд» */}
      {!done && next && !final && doneStage ? (
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => move.mutate({ taskId: task.id, stageId: doneStage.id, index: 0 })}
          className={cn(btn, 'border border-success/50 text-success hover:bg-success-soft/40')}
        >
          <Check className="size-3.5" strokeWidth={2} />
          {ui.tasks.stageComplete}
        </button>
      ) : null}
      {done ? (
        <span
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
            stageTone.success.chip,
          )}
        >
          <Check className="size-3.5" strokeWidth={2} />
          {ui.tasks.stageCompleted}
        </span>
      ) : null}
    </div>
  );
}

/** Поле «Стадия» (глобальная ось): чип текущей стадии + компактный список
 *  стадий схемы — стоит в инспекторе полей под проектом (модель Битрикса). */
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
