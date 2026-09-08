import { Button } from '@nodus/ui/components/button';

/** Фирменная кнопка отправки — гексагон-узел вместо самолётика
 * (единая для чата и обсуждений сущностей). */
export function SendHexButton({ disabled, label }: { disabled?: boolean; label: string }) {
  return (
    <Button type="submit" size="icon" disabled={disabled} aria-label={label}>
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <polygon points="7,1.5 11.8,4.25 11.8,9.75 7,12.5 2.2,9.75 2.2,4.25" />
      </svg>
    </Button>
  );
}
