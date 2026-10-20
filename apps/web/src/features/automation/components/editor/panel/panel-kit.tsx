import { cn } from '@nodus/ui/lib/utils';
import { ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@nodus/ui/components/button';

/**
 * Примитивы правой панели редактора (#378 ред. 2): поле с подписью, строка
 * раздела «Название ›» со сводкой (переход внутрь, модель Трекера),
 * сегменты, опасное действие внизу. Всё переносится — без обрезки по
 * горизонтали (`min-w-0`, `break-words`).
 */

/** Фокус в название нового элемента — БЕЗ прокрутки: панель ещё выезжает
 *  (обёртка overflow-hidden), обычный focus() сдвинул бы её содержимое. */
export function focusName(input: HTMLInputElement | null): void {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.select();
}

export function PanelField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs break-words text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Строка раздела: название, сводка текущих настроек, шеврон. */
export function SectionLink({
  title,
  summary,
  onClick,
}: {
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm">{title}</span>
        <span className="text-xs break-words text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex min-w-0 rounded-[10px] border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-xs transition-colors',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PanelDanger({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      className="mt-auto h-auto min-h-8 justify-start py-1.5 text-left whitespace-normal text-danger hover:text-danger"
      onClick={onClick}
    >
      <Trash2 className="size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </Button>
  );
}
