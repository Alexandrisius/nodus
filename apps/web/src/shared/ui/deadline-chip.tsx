import { CalendarClock } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatDateTime } from '../lib/format.js';

/** Чип срока: просрочен — красный, сегодня — оранжевый, далее — нейтральный. */
export function DeadlineChip({
  deadline,
  className,
}: {
  deadline: string | null;
  className?: string;
}) {
  if (!deadline) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>{ui.common.noDeadline}</span>
    );
  }
  const date = new Date(deadline);
  const now = new Date();
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  const overdue = date < now;
  const today = !overdue && date <= dayEnd;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        overdue && 'bg-rose-500/10 text-rose-600',
        today && 'bg-warning-soft text-warning',
        !overdue && !today && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <CalendarClock className="size-3.5" />
      {formatDateTime(deadline)}
      {overdue && ` · ${ui.tasks.overdue}`}
    </span>
  );
}
