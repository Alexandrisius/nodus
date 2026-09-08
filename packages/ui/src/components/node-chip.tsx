import type { ReactNode } from 'react';
import { cn } from '#lib/utils';

const tones = {
  muted: 'border-border text-muted-foreground',
  active: 'border-port/60 text-foreground shadow-[0_0_8px_var(--glow)]',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
  danger: 'border-danger/40 text-danger',
  info: 'border-info/40 text-info',
} as const;

/** Моно-чип «инструмента»: ключ сущности (ПП-142), статус, счётчик. */
function NodeChip({
  tone = 'muted',
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium tracking-[0.08em] tabular-nums select-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export { NodeChip };
