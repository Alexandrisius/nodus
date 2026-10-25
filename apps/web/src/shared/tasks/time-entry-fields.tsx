import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';

import { parseDuration } from '../lib/minutes.js';

/** Черновик ручной записи времени (окно перехода и «Внести время»). */
export interface TimeEntryDraft {
  /** Ввод длительности в деловой форме: «1ч 30м», «45м», «1:30». */
  amount: string;
  comment: string;
  /** 0 — сегодня, 1 — вчера (канон ручного учёта, #311). */
  daysAgo: number;
}

export const EMPTY_TIME_ENTRY: TimeEntryDraft = { amount: '', comment: '', daysAgo: 0 };

/** Тело записи времени из черновика: минуты 1..1440 и дата ISO. */
export function timeEntryBody(
  draft: TimeEntryDraft,
): { minutes: number; date: string; comment?: string } | null {
  const minutes = parseDuration(draft.amount);
  if (minutes === null || minutes > 1440) return null;
  const d = new Date();
  d.setDate(d.getDate() - draft.daysAgo);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    minutes,
    date,
    ...(draft.comment.trim() ? { comment: draft.comment.trim() } : {}),
  };
}

/**
 * Поля ручной записи времени (#380): сумма «1ч 30м», сегодня/вчера,
 * комментарий. Вынесены из учёта времени карточки — окно перехода и
 * поповер «Затрачено» показывают одну форму. Отправку делает вызывающий
 * (`timeEntryBody`).
 */
export function TimeEntryFields({
  value,
  onChange,
  disabled,
  autoFocus,
  amountAriaLabel = ui.tasks.timeAdd,
}: {
  value: TimeEntryDraft;
  onChange: (next: TimeEntryDraft) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  amountAriaLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus={autoFocus}
          value={value.amount}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder={ui.tasks.timeMinutesPlaceholder}
          aria-label={amountAriaLabel}
          className="h-8 w-28 font-mono text-sm"
        />
        {[ui.tasks.timeToday, ui.tasks.timeYesterday].map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, daysAgo: i })}
            aria-pressed={value.daysAgo === i}
            className={cn(
              'h-8 rounded-md px-2.5 text-sm transition-colors',
              value.daysAgo === i
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Input
        value={value.comment}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, comment: e.target.value })}
        placeholder={ui.tasks.timeComment}
        aria-label={ui.tasks.timeComment}
        className="h-8 text-sm"
      />
    </div>
  );
}
