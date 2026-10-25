import { ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@nodus/ui/components/button';
import { Switch } from '@nodus/ui/components/switch';

import { SegmentedControl } from '../../../../../shared/ui/segmented-control.js';

/**
 * Примитивы правой панели редактора (#378 ред. 2) — ОДНА грамматика для
 * панелей статуса и кнопки: поле с подписью, строка-переключатель, строка
 * «Название ›» со сводкой (раздел или связанный элемент — переход внутрь,
 * модель Трекера), сегменты, опасное действие внизу. Всё переносится — без
 * обрезки по горизонтали (`min-w-0`, `break-words`).
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

/** Строка-переключатель: название, пояснение, тумблер справа. */
export function SwitchRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{title}</span>
        {hint ? <span className="text-xs break-words text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

/** Строка «Название ›»: раздел панели или связанный элемент (кнопка
 *  статуса); сводка — текущие настройки; `actions` — доп. кнопки строки. */
export function SectionLink({
  title,
  summary,
  onClick,
  actions,
}: {
  title: string;
  summary: string;
  onClick: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group -mx-2 flex min-w-0 items-center gap-1 rounded-lg px-2 transition-colors hover:bg-accent/60">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm break-words">{title}</span>
          <span className="text-xs break-words text-muted-foreground">{summary}</span>
        </span>
      </button>
      {actions}
      {/* Шеврон — часть кликабельной строки (дубль основной кнопки для мыши). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onClick}
        className="flex self-stretch items-center"
      >
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      </button>
    </div>
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
    <SegmentedControl value={value} options={options} disabled={disabled} onChange={onChange} />
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
