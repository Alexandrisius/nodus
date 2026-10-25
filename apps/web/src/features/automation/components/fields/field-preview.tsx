import type { CustomFieldDefinition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { FieldRow } from '../../../../shared/ui/entity-fields.js';
import { CustomFieldTypeIcon } from '../../../../shared/custom-fields/field-type-icon.js';
import { CustomFieldValueView } from '../../../../shared/custom-fields/value-view.js';

/** «Как увидят в карточке» (#431): строка той же грамматики, что блок «Поля»
 *  карточки — подпись, иконка типа и значение по умолчанию (или «Не задано»). */
export function FieldPreview({ definition }: { definition: CustomFieldDefinition }) {
  const value =
    definition.defaultValue?.kind === 'static' ? definition.defaultValue.value : undefined;
  return (
    <div className="rounded-lg border border-border/60 px-2 py-1">
      <FieldRow
        icon={<CustomFieldTypeIcon type={definition.type} className="size-3.5" />}
        label={definition.name || ui.customFields.editor.namePlaceholder}
        hint={definition.hint}
      >
        <CustomFieldValueView definition={definition} value={value} refs={new Map()} />
      </FieldRow>
      {value === undefined ? (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          {ui.customFields.editor.previewEmpty}
        </p>
      ) : null}
    </div>
  );
}
