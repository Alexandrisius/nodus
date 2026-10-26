import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';

import { DateTimePicker } from '../../../../shared/ui/date-time-picker.js';
import { formatIsoDate, parseRuDate, todayIso } from '../../lib/letter-format.js';

/**
 * Дата с клавиатуры (#55): «25.10.2026», «251026», «25/10/26» — разбор на
 * каждом вводе (Ctrl+Enter сразу после даты видит её без потери фокуса),
 * ошибка формата — после Enter/ухода с поля. Календарь — кнопкой справа
 * (общий DateTimePicker без времени). Значение — ISO-дата или null.
 */
export function DateInput({
  id,
  value,
  onChange,
  ariaLabel,
  invalid,
  describedBy,
  placeholder = ui.letters.form.datePlaceholder,
  onEnter,
}: {
  id?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  ariaLabel: string;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  /** Enter с разобранной датой — хост ведёт к следующему полю. */
  onEnter?: () => void;
}) {
  const [text, setText] = useState(() => formatIsoDate(value));
  const [focused, setFocused] = useState(false);
  const [formatError, setFormatError] = useState(false);
  // Внешняя смена значения (календарь, сброс формы) — в текст, пока поле не в фокусе.
  const shown = focused ? text : formatIsoDate(value) || text;

  function commit(raw: string) {
    const trimmed = raw.trim();
    setFormatError(trimmed !== '' && parseRuDate(trimmed) === null);
  }

  return (
    <div className="relative min-w-0">
      <Input
        id={id}
        value={shown}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || formatError || undefined}
        aria-describedby={describedBy}
        onFocus={() => {
          setFocused(true);
          setText(formatIsoDate(value) || text);
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setFormatError(false);
          const iso = parseRuDate(e.target.value);
          if (iso !== value) onChange(iso);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;
          e.preventDefault();
          commit(text);
          const iso = parseRuDate(text);
          if (iso) {
            setText(formatIsoDate(iso));
            onEnter?.();
          }
        }}
        className={cn('h-8 pr-8 font-mono text-sm tabular-nums')}
      />
      <DateTimePicker
        value={value ? new Date(`${value}T00:00:00`) : null}
        onChange={(date) => {
          const iso = date ? todayIso(date) : null;
          setText(formatIsoDate(iso));
          setFormatError(false);
          onChange(iso);
        }}
        ariaLabel={ariaLabel}
        withTime={false}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={ariaLabel}
          className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Calendar className="size-3.5" strokeWidth={1.75} />
        </button>
      </DateTimePicker>
      {formatError ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {ui.letters.form.dateInvalid}
        </p>
      ) : null}
    </div>
  );
}
