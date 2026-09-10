import { ArrowRight, Check, ChevronDown, Kanban, Undo2 } from 'lucide-react';
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
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-40';

/**
 * Управление стадиями в карточке (вердикт владельца: стадия не ВЫБИРАЕТСЯ —
 * задача ДВИЖЕТСЯ по workflow-процессу). Глобальная ось: текущая стадия —
 * только отображение, управление — кнопки «вернуть на доработку» (предыдущая
 * стадия) и «вперёд» (следующая; переход в последнюю — «Завершить задачу»:
 * завершение только в конце пути). Схема концепта линейна, поэтому
 * вперёд/назад = по порядку схемы; ветвления и параллельные переходы — за
 * редактором workflow-схем после MVP (ADR-0008, issue #38).
 * Личная ось «Мой план»: чип с выпадающим списком колонок (ClickUp-паттерн).
 */
export function TaskStageControls({ task }: { task: TaskDetail }) {
  const { data: stages } = useTaskStages();
  const { data: personalStages } = usePersonalStages();
  const moveGlobal = useUpdateTaskStage();
  const movePersonal = useUpdateTaskPersonalStage();

  if (!stages) {
    return <div className="h-8" aria-hidden />;
  }

  const idx = stages.findIndex((s) => s.id === task.stage.id);
  const prev = idx > 0 ? stages[idx - 1] : undefined;
  const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : undefined;
  const final = next !== undefined && idx === stages.length - 2;
  const tone = stageTone[task.stage.color];
  const personal = personalStages?.find((s) => s.id === task.personalStageId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Текущая стадия процесса — только отображение (не селектор) */}
      <span
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium',
          tone.chip,
        )}
      >
        <span aria-hidden className={cn('size-2 rounded-full', tone.dot)} />
        <span className="max-w-44 truncate">{task.stage.name}</span>
      </span>
      {prev ? (
        <button
          type="button"
          disabled={moveGlobal.isPending}
          title={`${ui.tasks.stageReturn}: ${prev.name}`}
          onClick={() => moveGlobal.mutate({ taskId: task.id, stageId: prev.id, index: 0 })}
          className={cn(
            btn,
            'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Undo2 className="size-3.5" strokeWidth={1.75} />
          <span className="max-w-36 truncate">{prev.name}</span>
        </button>
      ) : null}
      {next ? (
        <button
          type="button"
          disabled={moveGlobal.isPending}
          onClick={() => moveGlobal.mutate({ taskId: task.id, stageId: next.id, index: 0 })}
          className={cn(
            btn,
            'border-primary/60 bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {final ? (
            <>
              <Check className="size-3.5" strokeWidth={2} />
              {ui.tasks.stageComplete}
            </>
          ) : (
            <>
              <span className="max-w-36 truncate">{next.name}</span>
              <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </>
          )}
        </button>
      ) : (
        <span
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium',
            stageTone.success.chip,
          )}
        >
          <Check className="size-3.5" strokeWidth={2} />
          {ui.tasks.stageCompleted}
        </span>
      )}

      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />

      {/* Личная ось «Мой план»: выбор колонки из списка (ClickUp-паттерн) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          title={ui.tasks.viewKanban}
          aria-label={`${ui.tasks.viewKanban}: ${personal?.name ?? '—'}`}
          className={cn(
            btn,
            'border-dashed border-border text-muted-foreground hover:border-port/50 hover:text-foreground data-[state=open]:text-foreground',
          )}
        >
          <Kanban className="size-3.5" strokeWidth={1.75} />
          <span className="max-w-44 truncate">{personal?.name ?? '—'}</span>
          <ChevronDown className="size-3.5 opacity-70" strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {personalStages?.map((stage) => (
            <DropdownMenuItem
              key={stage.id}
              onSelect={() =>
                movePersonal.mutate({ taskId: task.id, personalStageId: stage.id, index: 0 })
              }
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
    </div>
  );
}
