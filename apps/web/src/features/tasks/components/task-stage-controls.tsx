import { ArrowRight, Check, ChevronDown, Undo2 } from 'lucide-react';
import type { TaskDetail, TaskTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { gateReasonsText, useTaskTransitions } from '../api/transitions-api.js';
import { useTaskStages } from '../../../shared/api/task-stages.js';
import { stageTone } from '../../../shared/ui/board/stage-tone.js';
import { TaskTimerButton } from './task-time.js';
import { useTransitionRunner } from './task-transition-dialog.js';

/* Главные CTA задачи — ОДНОЙ высоты со вторичными: h-8 = 40px при --ui-scale
 * 1.25 = основные кнопки Битрикс24 (замер владельца 20.09.2026); важность —
 * заливкой, не размером (research Carbon/EUI; вердикт раунда 2: h-9=45px
 * «чуть больше, чем надо»). */
const btn =
  'inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40';
const valueChip =
  'inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded border px-1.5 font-mono text-label font-medium tracking-[0.08em] transition-colors hover:brightness-125 data-[state=open]:brightness-125';

/**
 * Замоноличенный нижний бар действий задачи (модель Битрикса: бар не
 * скроллится, всегда под рукой). Кнопки = ПЕРЕХОДЫ маршрута типа задачи
 * (ADR-0020), доступные текущему пользователю: сервер решает, кому какие
 * («Начать» — исполнителю, «Принять» — постановщику). Первая доступная —
 * основная; заблокированная гейтом (DoR/DoD) видна приглушённой, клик —
 * диалог с причинами и выходами (#311: закрыть с подзадачами, обойти гейт
 * по праву). Справа — таймер учёта времени. Личная колонка «Моего плана»
 * здесь НЕ показывается и из карточки не меняется — только DnD на доске.
 */
export function TaskActionBar({ task }: { task: TaskDetail }) {
  const { data: transitions } = useTaskTransitions(task.id);
  const runner = useTransitionRunner(task);

  if (!transitions) {
    return <div className="h-8" aria-hidden />;
  }

  const closed = task.stage.systemState === 'closed';
  const primaryId = transitions.find((t) => t.blockedBy.length === 0)?.id;

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      {runner.dialog}
      {closed ? (
        <span
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium',
            stageTone.success.chip,
          )}
        >
          <Check className="size-4" strokeWidth={2} />
          {task.stage.name}
        </span>
      ) : null}
      {transitions.map((t) => {
        const blocked = t.blockedBy.length > 0;
        const Icon = closesTask(t, task) ? Check : reopensTask(t, task) ? Undo2 : ArrowRight;
        return (
          <button
            key={t.id}
            type="button"
            disabled={runner.isPending}
            // НЕ aria-disabled: кнопка работает — открывает диалог причин.
            data-blocked={blocked || undefined}
            title={blocked ? gateReasonsText(t.blockedBy) : `${t.name}: ${t.toStageName}`}
            onClick={() => runner.run(t)}
            className={cn(
              btn,
              t.id === primaryId
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              blocked && 'opacity-50',
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            <span className="max-w-36 truncate">{t.name}</span>
          </button>
        );
      })}
      <span className="ml-auto" />
      <TaskTimerButton task={task} />
    </div>
  );
}

const OPEN = new Set(['backlog', 'active', 'paused']);

/** Переход закрывает задачу (иконка «галочка») / возвращает в работу. */
function closesTask(t: TaskTransition, task: TaskDetail): boolean {
  return OPEN.has(task.stage.systemState) && !OPEN.has(t.toStageState);
}

function reopensTask(t: TaskTransition, task: TaskDetail): boolean {
  return !OPEN.has(task.stage.systemState) && OPEN.has(t.toStageState);
}

/** Поле «Стадия» (глобальная ось): чип текущей стадии + список стадий,
 *  в которые ведут доступные переходы маршрута (модель Битрикса/Jira:
 *  выбор стадии = выполнение перехода, недоступные не показываются). */
export function TaskStageField({ task }: { task: TaskDetail }) {
  const { data: transitions } = useTaskTransitions(task.id);
  const runner = useTransitionRunner(task);
  const { data: stages } = useTaskStages();
  const tone = stageTone[task.stage.color];

  return (
    <>
      {runner.dialog}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={ui.tasks.fieldStage} className={cn(valueChip, tone.chip)}>
          <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} />
          <span className="truncate">{task.stage.name}</span>
          <ChevronDown className="size-3 shrink-0 opacity-70" strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem disabled>
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone.dot)} />
            <span className="truncate">{task.stage.name}</span>
            <Check className="ml-auto size-3.5 shrink-0 text-port" strokeWidth={2} />
          </DropdownMenuItem>
          {transitions?.map((t) => {
            const color = stages?.find((s) => s.id === t.toStageId)?.color ?? 'neutral';
            return (
              <DropdownMenuItem
                key={t.id}
                className={cn(t.blockedBy.length > 0 && 'opacity-50')}
                title={t.blockedBy.length > 0 ? gateReasonsText(t.blockedBy) : undefined}
                onSelect={() => runner.run(t)}
              >
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', stageTone[color].dot)}
                />
                <span className="truncate">{t.toStageName}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
