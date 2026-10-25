import { ui } from '@nodus/contracts';
import { Textarea } from '@nodus/ui/components/textarea';

/** «Причина / комментарий»: подпись раздела — из настройки кнопки. */
export function CommentSection({
  label,
  value,
  onChange,
  disabled,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
  required: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Textarea
      autoFocus={autoFocus}
      data-required-empty={required && !value.trim() ? 'true' : undefined}
      value={value}
      readOnly={disabled}
      maxLength={2000}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label || ui.tasks.window.commentLabel}
      aria-label={label || ui.tasks.window.commentLabel}
      aria-required={required}
      className="min-h-16 text-sm leading-relaxed [field-sizing:content]"
    />
  );
}
