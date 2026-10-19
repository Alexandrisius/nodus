import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Пилюля кнопки «из любого статуса» (`fromStageId = null`, #378, реф Jira
 * «Any»-лозенг): рёбрами такие кнопки не рисуются — висят у правого верхнего
 * угла целевого узла; клик выбирает переход (только у настройщика).
 */
export function AnyFromPill({
  name,
  active,
  onClick,
}: {
  name: string;
  /** Главная — залитый тон. */
  active: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick !== undefined;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={cn(
        'nodrag max-w-full rounded-full border py-0.5 pr-2 pl-1.5 text-left text-[11px] leading-4 transition-colors',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground',
        interactive && 'hover:border-input',
      )}
      title={`${ui.automation.anyFrom}: ${name}`}
    >
      <span className="opacity-70">{ui.automation.anyFrom}: </span>
      <span className="truncate">{name}</span>
    </button>
  );
}
