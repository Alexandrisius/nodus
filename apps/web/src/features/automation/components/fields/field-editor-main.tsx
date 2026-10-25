import { useState } from 'react';
import type {
  CustomFieldDefinition,
  CustomFieldSettings,
  UpdateCustomFieldBody,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Switch } from '@nodus/ui/components/switch';
import { Textarea } from '@nodus/ui/components/textarea';

import { CustomFieldTypeIcon } from '../../../../shared/custom-fields/field-type-icon.js';
import { familyModifier, familyOf, modifierOf } from '../../lib/field-type-families.js';
import { FieldSettings } from './field-settings.js';

/**
 * «Основное» и «Тип» редактора поля (#431): имя и подсказка сохраняются по
 * уходу фокуса; тип меняется только расширяющими модификаторами (Р3) —
 * включение с подтверждением, обратно нельзя (подсказка честная).
 */
export function FieldEditorMain({
  definition,
  readOnly,
  name,
  setName,
  nameError,
  commitName,
  save,
  onConfirmModifier,
}: {
  definition: CustomFieldDefinition;
  readOnly: boolean;
  name: string;
  setName: (name: string) => void;
  nameError: string | null;
  commitName: () => void;
  save: (patch: UpdateCustomFieldBody) => void;
  onConfirmModifier: (kind: 'multiline' | 'multiple') => void;
}) {
  const family = familyOf(definition.type);
  const modifier = familyModifier(family);
  const currentModifier = modifierOf(definition.type);
  const [hint, setHint] = useState(definition.hint ?? '');
  const [shownId, setShownId] = useState(definition.id);
  if (shownId !== definition.id) {
    setShownId(definition.id);
    setHint(definition.hint ?? '');
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <NodeLabel label={ui.customFields.editor.main} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{ui.customFields.editor.name}</span>
          <Input
            value={name}
            maxLength={60}
            disabled={readOnly}
            aria-invalid={nameError !== null || undefined}
            aria-describedby={nameError ? `cf-name-error-${definition.id}` : undefined}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setName(definition.name);
                setHint(definition.hint ?? '');
              }
            }}
            className="h-8 text-sm"
          />
          {nameError ? (
            <span id={`cf-name-error-${definition.id}`} className="text-xs text-danger">
              {nameError}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{ui.customFields.editor.hint}</span>
          <Textarea
            value={hint}
            maxLength={300}
            disabled={readOnly}
            placeholder={ui.customFields.editor.hintPlaceholder}
            aria-label={ui.customFields.editor.hint}
            className="min-h-12 text-sm [field-sizing:content]"
            onChange={(e) => setHint(e.target.value)}
            onBlur={() => {
              const next = hint.trim();
              if (next !== (definition.hint ?? '')) save({ hint: next || null });
            }}
          />
          <span className="text-label-sm text-muted-foreground">
            {ui.customFields.editor.hintLength}
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <NodeLabel label={ui.customFields.editor.type} />
        <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
          <CustomFieldTypeIcon type={definition.type} className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm">{ui.customFields.types[definition.type]}</span>
          {modifier ? (
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {modifier === 'multiline'
                ? ui.customFields.editor.multiline
                : ui.customFields.editor.multiple}
              <Switch
                size="sm"
                checked={currentModifier !== null}
                disabled={readOnly || currentModifier !== null}
                aria-label={
                  modifier === 'multiline'
                    ? ui.customFields.editor.multiline
                    : ui.customFields.editor.multiple
                }
                onCheckedChange={() => onConfirmModifier(modifier)}
              />
            </label>
          ) : null}
        </div>
        {modifier ? (
          <p className="text-xs text-muted-foreground">
            {currentModifier !== null
              ? ui.customFields.editor.oneWayHint
              : modifier === 'multiline'
                ? ui.customFields.editor.multilineHint
                : ui.customFields.editor.multipleHint}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{ui.customFields.editor.typeLocked}</p>
        )}
        {family === 'number' || family === 'money' ? (
          <FieldSettings
            family={family}
            settings={definition.settings}
            disabled={readOnly}
            onChange={(next: CustomFieldSettings) => save({ settings: next })}
          />
        ) : null}
      </section>
    </>
  );
}
