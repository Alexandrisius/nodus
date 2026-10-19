import type { WorkflowProblem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { CircleAlert } from 'lucide-react';

/** Чип проблем схемы (тулбар редактора): красный/жёлтый, клик — список. */
export function ProblemsChip({
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
