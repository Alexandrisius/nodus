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
    'bg-steel/80 text-cream',
    'bg-steel/80 text-cream',
    'bg-tealink/85 text-cream',
    'bg-ochre/90 text-cream',
    'bg-sage/85 text-cream',
    'bg-rust/85 text-cream',
  ];
  return tones[Math.min(order, tones.length - 1)] ?? 'bg-steel/80 text-cream';
}
