import { Archive, ArchiveRestore } from 'lucide-react';
import type { CustomFieldDefinition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { CustomFieldTypeIcon } from '../../../../shared/custom-fields/field-type-icon.js';
import { useArchiveCustomField } from '../../api/custom-fields-api.js';

/** Шапка редактора поля (h-14, как у списка типов и холста): значок типа,
 *  имя, «В архив» / «Вернуть» — только с правом (Р13). */
export function FieldEditorHeader({
  definition,
  canManage,
}: {
  definition: CustomFieldDefinition;
  canManage: boolean;
}) {
  const archive = useArchiveCustomField(true);
  const restore = useArchiveCustomField(false);
  const archived = definition.archivedAt !== null;

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground"
      >
        <CustomFieldTypeIcon type={definition.type} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{definition.name}</span>
        <span className="block truncate text-label-sm text-muted-foreground">
          {ui.customFields.types[definition.type]}
          {archived ? ` · ${ui.customFields.list.archivedBadge}` : ''}
        </span>
      </span>
      {canManage ? (
        archived ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={restore.isPending}
            onClick={() => restore.mutate(definition.id)}
          >
            <ArchiveRestore className="size-3.5" strokeWidth={1.75} />
            {ui.customFields.editor.restore}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={archive.isPending}
            onClick={() => archive.mutate(definition.id)}
          >
            <Archive className="size-3.5" strokeWidth={1.75} />
            {ui.customFields.editor.archive}
          </Button>
        )
      ) : null}
    </div>
  );
}
