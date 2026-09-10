import type { StageColor } from '@nodus/contracts';

/** Тон стадии → классы чипа, точки-порта, тинта колонки и свотча палитры.
 *  Только токены темы «Инструмент» (I15: hex в разметке запрещён). */
export const stageTone: Record<
  StageColor,
  { chip: string; dot: string; tint: string; swatch: string }
> = {
  neutral: {
    chip: 'border-border bg-accent/40 text-secondary-foreground',
    dot: 'bg-muted-foreground',
    tint: '',
    swatch: 'bg-muted-foreground',
  },
  info: {
    chip: 'border-info/40 bg-info-soft/60 text-info',
    dot: 'bg-info',
    tint: 'bg-info-soft/10',
    swatch: 'bg-info',
  },
  success: {
    chip: 'border-success/40 bg-success-soft/60 text-success',
    dot: 'bg-success',
    tint: 'bg-success-soft/10',
    swatch: 'bg-success',
  },
  warning: {
    chip: 'border-warning/40 bg-warning-soft/60 text-warning',
    dot: 'bg-warning',
    tint: 'bg-warning-soft/10',
    swatch: 'bg-warning',
  },
  danger: {
    chip: 'border-danger/40 bg-danger-soft/60 text-danger',
    dot: 'bg-danger',
    tint: 'bg-danger-soft/10',
    swatch: 'bg-danger',
  },
};

export const stageColorOrder: StageColor[] = ['neutral', 'info', 'success', 'warning', 'danger'];
