import { ui } from '@nodus/contracts';
import { Textarea } from '@nodus/ui/components/textarea';

/** «Итог»: текст отчёта с автоувеличением; префилл — последняя ревизия. */
export function ResultSection({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Textarea
      autoFocus={autoFocus}
      value={value}
      disabled={disabled}
      maxLength={5000}
      onChange={(e) => onChange(e.target.value)}
      placeholder={ui.tasks.window.resultPlaceholder}
      aria-label={ui.tasks.window.resultLabel}
      className="min-h-20 text-sm leading-relaxed [field-sizing:content]"
    />
  );
}
