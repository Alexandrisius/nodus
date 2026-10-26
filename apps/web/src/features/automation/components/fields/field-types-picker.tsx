import type { CustomFieldScope, ProcessType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Check } from 'lucide-react';

import { useProcessTypes } from '../../api/automation-api.js';
import { ProcessTypeGlyph } from '../../../../shared/workflow/process-type-icon.js';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Поле «Типы» окна атрибута (#432, В2): типы задач — для атрибутов задач,
 * типы писем — для писем (#55). У проектов и контрагентов типов процессов
 * нет — поля нет вовсе (атрибут действует на всех). Пусто — атрибут нигде
 * не показывается: карточка, форма, окна и условия видят только свои.
 */
export function FieldTypesPicker({
  scope,
  typeIds,
  disabled,
  onChange,
}: {
  scope: CustomFieldScope;
  typeIds: readonly string[];
  disabled: boolean;
  onChange: (typeIds: string[]) => void;
}) {
  const typed = scope === 'task' || scope === 'letter';
  const { data: types, isLoading, isError, refetch } = useProcessTypes();
  if (!typed) return null;

  const options = (types ?? []).filter((type) => type.category === scope && !type.archivedAt);
  const toggle = (type: ProcessType) =>
    onChange(
      typeIds.includes(type.id) ? typeIds.filter((id) => id !== type.id) : [...typeIds, type.id],
    );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-muted-foreground">{ui.customFields.bind.field}</span>
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input px-1.5 py-1">
        {isLoading ? (
          <span className="px-1 text-xs text-muted-foreground">{ui.customFields.bind.loading}</span>
        ) : isError ? (
          <button
            type="button"
            onClick={() => void refetch()}
            className="px-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {ui.customFields.bind.error} — {ui.customFields.bind.retry}
          </button>
        ) : options.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">{ui.customFields.bind.empty}</span>
        ) : (
          options.map((type) => {
            const on = typeIds.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(type)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors',
                  on
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <ProcessTypeGlyph icon={type.icon} className="size-3" />
                {type.name}
                {on ? <Check className="size-3" strokeWidth={2} /> : null}
              </button>
            );
          })
        )}
      </div>
      <span className="text-xs text-muted-foreground">{ui.customFields.bind.hint}</span>
    </div>
  );
}
