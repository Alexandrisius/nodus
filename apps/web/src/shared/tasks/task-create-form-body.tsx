import { useMemo } from 'react';
import type {
  CreationFieldKey,
  CreationForm,
  CustomFieldDefinition,
  ProcessType,
  RoleLabels,
} from '@nodus/contracts';
import { customFieldIdOfKey, slotLabel, ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { isWide, SlotControl } from './task-create-fields.js';

/**
 * Низ окна создания (#432, Р9): поля эффективной формы выбранного типа —
 * системные и атрибуты типа, в порядке формы. Подпись — своё название слота,
 * иначе название роли из настроек типа, иначе стандартное (Р3). Поле с
 * ошибкой 422 подсвечено; пустое обязательное помечено звёздочкой.
 */
export function TaskCreateFormBody({
  type,
  form,
  values,
  onChange,
  definitions,
  invalidKeys,
  preview = false,
}: {
  type: ProcessType | null;
  form: CreationForm;
  values: Readonly<Record<string, unknown>>;
  onChange: (key: CreationFieldKey, value: unknown) => void;
  definitions: readonly CustomFieldDefinition[];
  invalidKeys?: ReadonlySet<string>;
  /** Предпросмотр в редакторе: контролы неактивны, но выглядят как живые. */
  preview?: boolean;
}) {
  const roleLabels: RoleLabels = type?.config.card.roleLabels ?? {};
  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  if (form.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{ui.taskCreate.noFields}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {form.fields.map((slot) => {
        const fieldId = customFieldIdOfKey(slot.key);
        const definition = fieldId ? byId.get(fieldId) : undefined;
        const label = slotLabel(slot, { roleLabels, definitions });
        const invalid = invalidKeys?.has(slot.key) ?? false;
        const wide = isWide(slot, definition);
        return (
          <div
            key={slot.key}
            className={cn(
              'min-w-0',
              wide ? 'flex flex-col gap-1.5' : 'grid grid-cols-[8rem_1fr] items-center gap-x-3',
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              <NodeLabel label={label} className="min-w-0" />
              {slot.required ? (
                <span aria-hidden className="text-danger">
                  *
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <SlotControl
                slot={slot}
                definition={definition}
                value={values[slot.key]}
                invalid={invalid}
                preview={preview}
                label={label}
                onChange={(value) => onChange(slot.key, value)}
              />
            </div>
            {slot.required ? <span className="sr-only">{ui.taskCreate.requiredMark}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Поле названия (шапка окна) — вынесено сюда же, чтобы окно и предпросмотр
 *  держали одну грамматику верхней строки. */
export function TaskCreateTitleField({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={ui.taskCreate.titlePlaceholder}
      aria-label={ui.taskCreate.titlePlaceholder}
      readOnly={readOnly}
      className="h-9 w-[calc(100%-2.5rem)] text-body-lg"
    />
  );
}
