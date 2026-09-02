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

/** Тон колонки канбана по порядку стадии (пастельные статусы, §10.4). */
export function stageColumnTone(order: number): string {
  const tones = [
    'bg-muted-foreground/15 text-muted-foreground',
    'bg-info-soft text-info',
    'bg-info-soft text-info',
    'bg-warning-soft text-warning',
    'bg-success-soft text-success',
    'bg-danger-soft text-danger',
  ];
  return tones[Math.min(order, tones.length - 1)] ?? 'bg-muted text-muted-foreground';
}
