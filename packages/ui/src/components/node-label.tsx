import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '#lib/utils';

/** Моно-метка раздела в стиле «инструмент»: UPPERCASE + счётчик/шеврон (реф node-based UI). */
function NodeLabel({
  label,
  count,
  chevron,
  className,
}: {
  label: string;
  count?: number;
  chevron?: 'down' | 'right';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase select-none',
        className,
      )}
    >
      {label}
      {count !== undefined && <span className="text-foreground tabular-nums">{count}</span>}
      {chevron === 'down' && <ChevronDown className="size-3.5" strokeWidth={1.75} />}
      {chevron === 'right' && <ChevronRight className="size-3.5" strokeWidth={1.75} />}
    </span>
  );
}

export { NodeLabel };
