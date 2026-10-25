import { Check, ExternalLink, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import type { WindowConditionLine } from './window-conditions.js';

/**
 * Живой список условий кнопки в окне (#380): ✓/✗ по мере заполнения;
 * неисправимые окном (подзадачи, чек-лист) — со ссылкой в карточку.
 * `aria-live` — состояние меняется без перерисовки фокуса.
 */
export function ConditionsList({
  lines,
  onOpenChecklist,
  onOpenSubtasks,
}: {
  lines: readonly WindowConditionLine[];
  onOpenChecklist?: () => void;
  onOpenSubtasks?: () => void;
}) {
  if (lines.length === 0) return null;
  return (
    <ul aria-live="polite" className="flex flex-col gap-1">
      {lines.map((line) => {
        const kind = line.validator.kind;
        const action =
          kind === 'checklist_complete' && !line.ok
            ? { label: ui.tasks.window.openChecklist, onClick: onOpenChecklist }
            : kind === 'no_open_subtasks' && !line.ok
              ? { label: ui.tasks.window.openSubtasks, onClick: onOpenSubtasks }
              : null;
        return (
          <li key={kind} className="flex items-start gap-1.5 text-xs">
            {line.ok ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2} />
            ) : (
              <X className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={2} />
            )}
            <span className={cn('min-w-0', line.ok ? 'text-muted-foreground' : 'text-foreground')}>
              {ui.tasks.window.conditionLabels[kind]}
              {action?.onClick ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="ml-1 h-auto gap-1 p-0 text-xs"
                  onClick={action.onClick}
                >
                  {action.label}
                  <ExternalLink className="size-3" strokeWidth={1.75} />
                </Button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
