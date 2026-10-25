import { useState } from 'react';
import type {
  CustomFieldDefault,
  CustomFieldDefinition,
  CustomFieldRef,
  CustomFieldValue,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { CustomFieldEditor } from '../../../../shared/custom-fields/value-editor.js';

type Mode = 'none' | 'static' | 'author_department';

function modeOf(value: CustomFieldDefault | null): Mode {
  return value?.kind ?? 'none';
}

/**
 * Значение по умолчанию (#431, Р5): «нет», статическое значение или
 * «подразделение автора» (только у поля «Подразделение»). Статическое
 * значение задаётся тем же редактором, что и в карточке, — одна грамматика.
 */
export function FieldDefaultValue({
  definition,
  disabled,
  onChange,
}: {
  definition: CustomFieldDefinition;
  disabled: boolean;
  onChange: (value: CustomFieldDefault | null) => void;
}) {
  const [mode, setMode] = useState<Mode>(modeOf(definition.defaultValue));
  const [syncedFrom, setSyncedFrom] = useState(definition.defaultValue);
  if (syncedFrom !== definition.defaultValue) {
    setSyncedFrom(definition.defaultValue);
    setMode(modeOf(definition.defaultValue));
  }
  const authorDepartment = definition.type === 'department';
  const staticValue =
    definition.defaultValue?.kind === 'static' ? definition.defaultValue.value : undefined;

  function choose(next: Mode) {
    setMode(next);
    if (next === 'none') onChange(null);
    if (next === 'author_department') onChange({ kind: 'author_department' });
    if (next === 'static' && staticValue !== undefined)
      onChange({ kind: 'static', value: staticValue });
  }

  const option = (value: Mode, label: string, disabledOption = false) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={mode === value}
      disabled={disabled || disabledOption}
      onClick={() => choose(value)}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
        mode === value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/60',
        disabledOption && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 rounded-full border',
          mode === value
            ? 'border-primary bg-primary ring-2 ring-primary/20'
            : 'border-muted-foreground/50',
        )}
      />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={ui.customFields.editor.defaultValue}
        className="flex flex-wrap gap-1.5"
      >
        {option('none', ui.customFields.editor.defaultNone)}
        {option('static', ui.customFields.editor.defaultStatic)}
        {authorDepartment
          ? option('author_department', ui.customFields.editor.defaultAuthorDepartment)
          : null}
      </div>
      {mode === 'static' ? (
        <CustomFieldEditor
          definition={definition}
          value={staticValue}
          refs={[] as CustomFieldRef[]}
          disabled={disabled}
          variant="form"
          onCommit={(value: CustomFieldValue | null) =>
            onChange(value === null ? null : { kind: 'static', value })
          }
        />
      ) : null}
      {mode === 'author_department' ? (
        <p className="text-xs text-muted-foreground">
          {ui.customFields.editor.defaultAuthorDepartmentHint}
        </p>
      ) : null}
    </div>
  );
}
