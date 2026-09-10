import type { TaskStage, TaskSystemState } from '@nodus/contracts';

import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

const stageTone: Record<TaskSystemState, 'muted' | 'info' | 'success' | 'warning'> = {
  backlog: 'muted',
  active: 'info',
  done: 'success',
  paused: 'warning',
  closed: 'muted',
};

/** Стадия задачи — моно-чип «инструмента» (тон по системному состоянию, I15). */
export function TaskStatusBadge({ stage, className }: { stage: TaskStage; className?: string }) {
  return (
    <NodeChip tone={stageTone[stage.systemState]} className={cn('shrink-0', className)}>
      {stage.name}
    </NodeChip>
  );
}
