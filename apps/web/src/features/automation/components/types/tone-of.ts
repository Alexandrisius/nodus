import type { TaskType } from '@nodus/contracts';

/** Тон плитки-значка типа задачи (токены темы, I15). */
export function toneOf(color: TaskType['color']): string {
  const tones: Record<TaskType['color'], string> = {
    neutral: 'border-border bg-muted text-muted-foreground',
    info: 'border-info/40 bg-info-soft/60 text-info',
    success: 'border-success/40 bg-success-soft/60 text-success',
    warning: 'border-warning/40 bg-warning-soft/60 text-warning',
    danger: 'border-danger/40 bg-danger-soft/60 text-danger',
  };
  return tones[color];
}
