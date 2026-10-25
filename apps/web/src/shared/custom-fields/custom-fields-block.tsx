import { Settings2 } from 'lucide-react';
import type {
  CustomFieldRef,
  CustomFieldScope,
  CustomFieldValue,
  CustomFieldValues,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { FieldRow } from '../ui/entity-fields.js';
import { CustomFieldTypeIcon } from './field-type-icon.js';
import { activeDefinitions, useCustomFieldDefinitions } from './queries.js';
import { CustomFieldEditor } from './value-editor.js';

/**
 * Блок «Поля» карточки сущности (#431, Р1/Р6): сетка строк той же
 * грамматики, что `EntityFields` (иконка + моно-метка w-44 + значение,
 * 1→2 колонки по @container), правка по месту. Нет активных полей — блока
 * нет вовсе; загрузка — два скелета; ошибка — строка с повтором (карточка
 * живёт дальше). Значения правит вызывающий (оптимистично, I4).
 */
export function CustomFieldsBlock({
  scope,
  values,
  refs,
  canEdit,
  onChange,
  onConfigure,
}: {
  scope: CustomFieldScope;
  values: CustomFieldValues;
  refs: readonly CustomFieldRef[];
  canEdit: boolean;
  onChange: (fieldId: string, value: CustomFieldValue | null, refs?: CustomFieldRef[]) => void;
  /** «Настроить» — только у тех, кто может править поля (право
   *  custom_field.manage проверяет вызывающий); переход делает хост. */
  onConfigure?: () => void;
}) {
  const query = useCustomFieldDefinitions(scope);
  const definitions = activeDefinitions(query.data);

  if (query.isLoading) {
    return (
      <section className="mt-7 flex flex-col gap-2">
        <NodeLabel label={ui.customFields.block.title} />
        <Skeleton className="h-8 w-full max-w-md" />
        <Skeleton className="h-8 w-full max-w-sm" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="mt-7 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{ui.customFields.block.loadError}</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="rounded px-1 font-medium text-foreground underline-offset-2 hover:underline"
        >
          {ui.customFields.block.retry}
        </button>
      </section>
    );
  }

  if (definitions.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <NodeLabel label={ui.customFields.block.title} count={definitions.length} />
        {onConfigure ? (
          <button
            type="button"
            onClick={onConfigure}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <Settings2 className="size-3.5" strokeWidth={1.75} aria-hidden />
            {ui.customFields.block.configure}
          </button>
        ) : null}
      </div>
      <div className="mt-1 grid grid-cols-1 gap-x-12 gap-y-0.5 @min-[55rem]:grid-cols-2">
        {definitions.map((definition) => {
          const hintId = `cf-hint-${definition.id}`;
          return (
            <FieldRow
              key={definition.id}
              icon={<CustomFieldTypeIcon type={definition.type} className="size-3.5" />}
              label={definition.name}
              hint={definition.hint}
              hintId={hintId}
            >
              <CustomFieldEditor
                definition={definition}
                value={values[definition.id]}
                refs={refs}
                disabled={!canEdit}
                variant="inline"
                onCommit={(value, pickedRefs) => onChange(definition.id, value, pickedRefs)}
              />
              {definition.hint ? (
                <span id={hintId} className="sr-only">
                  {definition.hint}
                </span>
              ) : null}
            </FieldRow>
          );
        })}
      </div>
    </section>
  );
}
