import { Info } from 'lucide-react';
import { useState } from 'react';
import type {
  CustomFieldDefault,
  CustomFieldDefinition,
  UpdateCustomFieldBody,
} from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';
import { toast } from 'sonner';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Switch } from '@nodus/ui/components/switch';

import { ApiError } from '../../../../shared/api-client.js';
import { useUpdateCustomField } from '../../api/custom-fields-api.js';
import { familyOf, typeWithModifier } from '../../lib/field-type-families.js';
import { FieldDefaultValue } from './field-default-value.js';
import { FieldEditorHeader } from './field-editor-header.js';
import { FieldEditorMain } from './field-editor-main.js';
import { FieldOptionsEditor } from './field-options-editor.js';
import { FieldPreview } from './field-preview.js';

type ConfirmKind = 'multiline' | 'multiple' | null;

/**
 * Редактор поля (#431): «Основное», «Тип» с односторонними модификаторами,
 * настройки типа, «Варианты» списка, «Значение по умолчанию», «Отчёты» и
 * превью строки карточки. Сохранение — по уходу фокуса; ошибка сервера
 * (занятое имя) — под полем, остальное — подсказкой. Архивное — только чтение.
 */
export function FieldEditor({
  definition,
  definitions,
  canManage,
}: {
  definition: CustomFieldDefinition;
  definitions: readonly CustomFieldDefinition[];
  canManage: boolean;
}) {
  const update = useUpdateCustomField();
  const [name, setName] = useState(definition.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const archived = definition.archivedAt !== null;
  const readOnly = !canManage || archived;
  const sharedDictionary =
    definition.dictionary !== null &&
    definitions.filter((d) => d.settings.dictionaryId === definition.settings.dictionaryId).length >
      1;

  // Смена поля в списке — имя берётся из нового определения (derive-render).
  const [shownId, setShownId] = useState(definition.id);
  if (shownId !== definition.id) {
    setShownId(definition.id);
    setName(definition.name);
    setNameError(null);
  }

  async function save(patch: UpdateCustomFieldBody) {
    try {
      setNameError(null);
      await update.mutateAsync({ id: definition.id, body: patch });
    } catch (error) {
      // Занятое имя — под полем (пользователь тут же правит); остальное —
      // тост: значение откатилось, поле имени не при чём.
      if (error instanceof ApiError && error.code === ErrorCode.CUSTOM_FIELD_NAME_TAKEN) {
        setNameError(errorMessages[ErrorCode.CUSTOM_FIELD_NAME_TAKEN]);
        return;
      }
      toast.error(
        error instanceof ApiError && error.code in errorMessages
          ? errorMessages[error.code as ErrorCode]
          : ui.customFields.editor.saveError,
      );
    }
  }

  function commitName() {
    const next = name.trim();
    if (next.length === 0) {
      setName(definition.name);
      return;
    }
    if (next !== definition.name) void save({ name: next });
  }

  function applyModifier(kind: 'multiline' | 'multiple') {
    setConfirm(null);
    void save({ type: typeWithModifier(familyOf(definition.type), kind) });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FieldEditorHeader definition={definition} canManage={canManage} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-6 py-5">
          {archived ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              {ui.customFields.editor.archivedNote}
            </div>
          ) : null}
          {definition.scope !== 'task' ? (
            <p className="text-xs text-muted-foreground">
              {
                ui.customFields.scopePending[
                  definition.scope as 'letter' | 'project' | 'counterparty'
                ]
              }
            </p>
          ) : null}

          <FieldEditorMain
            definition={definition}
            readOnly={readOnly}
            name={name}
            setName={setName}
            nameError={nameError}
            commitName={commitName}
            save={(patch) => void save(patch)}
            onConfirmModifier={setConfirm}
          />

          {definition.dictionary ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <NodeLabel label={ui.customFields.editor.options} />
                <span className="truncate text-label-sm text-muted-foreground">
                  {definition.dictionary.name}
                </span>
              </div>
              <FieldOptionsEditor
                definition={definition}
                shared={sharedDictionary}
                disabled={readOnly}
              />
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <NodeLabel label={ui.customFields.editor.defaultValue} />
            <FieldDefaultValue
              definition={definition}
              disabled={readOnly}
              onChange={(value: CustomFieldDefault | null) => void save({ defaultValue: value })}
            />
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm">{ui.customFields.editor.reportIndexed}</span>
                <span className="text-xs text-muted-foreground">
                  {ui.customFields.editor.reportIndexedHint}
                </span>
              </div>
              <Switch
                checked={definition.reportIndexed}
                disabled={readOnly}
                aria-label={ui.customFields.editor.reportIndexed}
                onCheckedChange={(checked) => void save({ reportIndexed: checked })}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <NodeLabel label={ui.customFields.editor.preview} />
            <FieldPreview definition={definition} />
          </section>
        </div>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent showCloseButton={false} className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm === 'multiline'
                ? ui.customFields.confirm.multilineTitle
                : ui.customFields.confirm.multipleTitle}
            </DialogTitle>
            <DialogDescription>
              {confirm === 'multiline'
                ? ui.customFields.confirm.multilineText
                : ui.customFields.confirm.multipleText}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {ui.common.cancel}
            </Button>
            <Button onClick={() => confirm && applyModifier(confirm)}>
              {ui.customFields.confirm.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Пустой вид правой области: поле не выбрано. */
export function FieldEditorEmpty() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      <span className="max-w-xs">{ui.customFields.editor.notSelected}</span>
    </div>
  );
}
