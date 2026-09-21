import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '#lib/utils';

/** Заголовок раздела/колонки таблицы: SANS semibold UPPERCASE 12px + счётчик
 * (issue #60 раунд 2: моно-метки читались «вторым огромным шрифтом» — вердикт
 * тестировщиков и паттерн Битрикс24; enterprise-канон: заголовки таблиц/секций
 * — sans uppercase с трекингом, моно остаётся ТОЛЬКО данным). Счётчик — данные:
 * моно 11px таблично. */
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
        'inline-flex items-center gap-2 text-label font-semibold tracking-[0.08em] text-muted-foreground uppercase select-none',
        className,
      )}
    >
      {label}
      {count !== undefined && (
        <span className="font-mono text-label-sm text-foreground tabular-nums">{count}</span>
      )}
      {chevron === 'down' && <ChevronDown className="size-3.5" strokeWidth={1.75} />}
      {chevron === 'right' && <ChevronRight className="size-3.5" strokeWidth={1.75} />}
    </span>
  );
}

export { NodeLabel };
