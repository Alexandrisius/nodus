import type { OrgUnitKind } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Переключатель управленческая/юридическая структура — пилюля ТОГО же образца,
 * что переключатель ящиков «Общий / Личная» в корреспонденции (вердикт
 * владельца 24.09.2026: кнопка создания и переключатель — в образце стиля
 * корреспонденции, правый угол шапки свободен): рамка rounded-lg p-0.5,
 * активный сегмент — bg-accent rounded-md, неактивный — muted с hover.
 */
export function StructureKindSwitcher({
  kind,
  onChange,
}: {
  kind: OrgUnitKind;
  onChange: (kind: OrgUnitKind) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ui.employees.structure}
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      {(['management', 'legal'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={kind === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
            kind === value
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === 'management' ? ui.employees.kindManagement : ui.employees.kindLegal}
        </button>
      ))}
    </div>
  );
}
