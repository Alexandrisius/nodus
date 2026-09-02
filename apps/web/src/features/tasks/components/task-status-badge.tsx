import type { TaskStage } from '@nodus/contracts';

import { Badge } from '@nodus/ui/components/badge';
import { cn } from '@nodus/ui/lib/utils';

const stageTone: Record<string, string> = {
  backlog: 'bg-secondary text-secondary-foreground',
  active: 'bg-info-soft text-info',
  done: 'bg-success-soft text-success',
  paused: 'bg-warning-soft text-warning',
  closed: 'bg-muted text-muted-foreground',
};

export function TaskStatusBadge({ stage, className }: { stage: TaskStage; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('h-6', stageTone[stage.systemState], className)}>
      {stage.name}
    </Badge>
  );
}

/** Тон колонки канбана по порядку стадии: насыщенные «сигнальные» шапки поверх заставки. */
export function stageColumnTone(order: number): string {
  const tones = [
    'bg-slate-500/80 text-white',
    'bg-sky-500/85 text-white',
    'bg-teal-500/85 text-white',
    'bg-amber-500/85 text-white',
    'bg-emerald-500/85 text-white',
    'bg-rose-500/85 text-white',
  ];
  return tones[Math.min(order, tones.length - 1)] ?? 'bg-slate-500/80 text-white';
}
