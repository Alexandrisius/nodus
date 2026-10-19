import type { WorkflowProblem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';
import { CircleAlert, Redo2, Undo2 } from 'lucide-react';

/**
 * Правая часть строки инструментов редактора: отмена/повтор, «Упорядочить»,
 * чип проблем (красный/жёлтый, клик — список), «Отменить изменения» и
 * «Опубликовать»; без права — бейдж «Только просмотр».
 */
export function EditorToolbar({
  canManage,
  dirty,
  problems,
  canUndo,
  canRedo,
  publishBlocked,
  onUndo,
  onRedo,
  onTidy,
  onProblemClick,
  onDiscard,
  onPublish,
}: {
  canManage: boolean;
  dirty: boolean;
  problems: readonly WorkflowProblem[];
  canUndo: boolean;
  canRedo: boolean;
  publishBlocked: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTidy: () => void;
  onProblemClick: (problem: WorkflowProblem) => void;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;

  return (
    <div className="flex items-center gap-1.5">
      {canManage ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui.automation.undo}
            title={`${ui.automation.undo} (Ctrl+Z)`}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="size-4" strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui.automation.redo}
            title={`${ui.automation.redo} (Ctrl+Shift+Z)`}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="size-4" strokeWidth={1.75} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onTidy}>
            {ui.automation.tidyUp}
          </Button>
          {problems.length > 0 ? (
            <ProblemsChip
              errors={errors}
              warnings={warnings}
              problems={problems}
              onProblemClick={onProblemClick}
            />
          ) : null}
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              {ui.automation.discard}
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={publishBlocked || errors > 0}
            title={errors > 0 ? `${ui.automation.problemsFixFirst} ${errors}` : undefined}
            onClick={onPublish}
          >
            {ui.automation.publish}
          </Button>
        </>
      ) : (
        <span className="rounded-full border border-border bg-accent/40 px-2.5 py-1 text-xs text-muted-foreground">
          {ui.automation.readOnly}
        </span>
      )}
    </div>
  );
}

function ProblemsChip({
  errors,
  warnings,
  problems,
  onProblemClick,
}: {
  errors: number;
  warnings: number;
  problems: readonly WorkflowProblem[];
  onProblemClick: (problem: WorkflowProblem) => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
          errors > 0
            ? 'border-danger/40 bg-danger-soft/60 text-danger'
            : 'border-warning/40 bg-warning-soft/60 text-warning',
        )}
      >
        <CircleAlert className="size-3.5" strokeWidth={1.75} />
        {ui.automation.problemsChip} · {errors + warnings}
      </button>
      <div className="invisible absolute right-0 top-full z-20 mt-1 w-72 rounded-[14px] border bg-card p-1.5 opacity-0 shadow-sm transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        {problems.map((problem, index) => (
          <button
            key={`${problem.code}-${problem.stageId ?? problem.transitionId ?? index}`}
            type="button"
            onClick={() => onProblemClick(problem)}
            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
          >
            <span
              aria-hidden
              className={cn(
                'mt-1 size-1.5 shrink-0 rounded-full',
                problem.severity === 'error' ? 'bg-danger' : 'bg-warning',
              )}
            />
            <span className="min-w-0 flex-1">{ui.automation.problems[problem.code]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
