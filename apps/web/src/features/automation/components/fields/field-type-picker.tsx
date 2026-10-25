import type { FieldFamily } from '../../lib/field-type-families.js';
import { FIELD_FAMILIES, baseTypeOf } from '../../lib/field-type-families.js';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { projectsAvailable } from '../../../../shared/api/projects-available.js';
import { CustomFieldTypeIcon } from '../../../../shared/custom-fields/field-type-icon.js';

/**
 * Плитки 13 семейств «Нового поля» (#431): radiogroup с иконкой, названием и
 * подсказкой. «Проект» до модуля проектов — недоступная плитка с честной
 * подсказкой (Р11); в моках доступен.
 */
export function FieldTypePicker({
  value,
  disabled,
  onChange,
}: {
  value: FieldFamily | null;
  disabled?: boolean;
  onChange: (family: FieldFamily) => void;
}) {
  const projectsReady = projectsAvailable();
  return (
    <div
      role="radiogroup"
      aria-label={ui.customFields.create.type}
      className="grid auto-rows-fr grid-cols-2 gap-2"
    >
      {FIELD_FAMILIES.map((family) => {
        const unavailable = family === 'project' && !projectsReady;
        const active = value === family;
        return (
          <button
            key={family}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || unavailable}
            title={
              unavailable
                ? ui.customFields.typeUnavailable.project
                : ui.customFields.familyHints[family]
            }
            onClick={() => onChange(family)}
            className={cn(
              'flex min-w-0 items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
              active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/60',
              unavailable && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border',
                active ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
              )}
            >
              <CustomFieldTypeIcon type={baseTypeOf(family)} className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm leading-tight">{ui.customFields.families[family]}</span>
              <span className="truncate text-label-sm leading-tight text-muted-foreground">
                {unavailable
                  ? ui.customFields.typeUnavailable.project
                  : ui.customFields.familyHints[family]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
