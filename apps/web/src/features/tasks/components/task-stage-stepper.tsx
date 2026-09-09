import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useTaskStages, useUpdateTaskStage } from '../api/tasks-api.js';

/**
 * Жизненный цикл задачи в языке нод: стадии — порты, соединённые рёбрами;
 * текущий порт пульсирует, пройденные залиты, будущие — контуром.
 * Клик по стадии = оптимистичный перенос задачи (I4, тот же хук, что в канбане):
 * главное действие задачи доступно в один клик из карточки.
 */
export function TaskStageStepper({
  taskId,
  currentStageId,
}: {
  taskId: string;
  currentStageId: string;
}) {
  const { data: stages } = useTaskStages();
  const move = useUpdateTaskStage();

  if (!stages) {
    return <div className="h-8" aria-hidden />;
  }

  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div
      className="flex min-w-0 items-center overflow-x-auto"
      role="group"
      aria-label={ui.tasks.fieldStage}
    >
      {stages.map((stage, i) => {
        const state = i === currentIndex ? 'current' : i < currentIndex ? 'done' : 'next';
        return (
          <span key={stage.id} className="flex shrink-0 items-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn('h-px w-7 shrink-0', i <= currentIndex ? 'bg-port/60' : 'bg-edge')}
              />
            ) : null}
            <button
              type="button"
              disabled={state === 'current' || move.isPending}
              onClick={() => move.mutate({ taskId, stageId: stage.id, index: 0 })}
              title={state === 'current' ? stage.name : `${ui.tasks.fieldStage}: ${stage.name}`}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors',
                state === 'current' ? 'bg-accent/60' : 'hover:bg-accent/60',
              )}
            >
              <span className="relative flex size-2.5 shrink-0 items-center justify-center">
                {state === 'current' ? (
                  <span className="absolute size-4 animate-pulse rounded-full bg-port/25" />
                ) : null}
                <span
                  className={cn(
                    'relative size-2.5 rounded-full border',
                    state === 'current' && 'border-port bg-port',
                    state === 'done' && 'border-success/70 bg-success/60',
                    state === 'next' && 'border-muted-foreground/40 bg-transparent',
                  )}
                />
              </span>
              <span
                className={cn(
                  'font-mono text-[11px] tracking-[0.08em] uppercase transition-colors',
                  state === 'current'
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                {stage.name}
              </span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
