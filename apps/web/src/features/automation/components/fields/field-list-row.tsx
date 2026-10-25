import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { Archive, ArchiveRestore, GripVertical, MoreHorizontal } from 'lucide-react';
import type { CustomFieldDefinition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { CustomFieldTypeIcon } from '../../../../shared/custom-fields/field-type-icon.js';

/** Строка реестра полей: плитка типа, название, мета (тип, умолчание),
 *  ручка порядка и меню «⋯» по ховеру/фокусу (#431). */
export function SortableFieldRow({
  definition,
  selected,
  canManage,
  archived,
  onSelect,
  onArchive,
}: {
  definition: CustomFieldDefinition;
  selected: boolean;
  canManage: boolean;
  archived: boolean;
  onSelect: () => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: definition.id,
    disabled: archived || !canManage,
  });
  const defaultText =
    definition.defaultValue === null
      ? null
      : definition.defaultValue.kind === 'author_department'
        ? ui.customFields.editor.defaultAuthorDepartment
        : ui.customFields.editor.defaultStatic;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group/row relative', isDragging && 'z-10')}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors',
          selected ? 'bg-accent' : 'hover:bg-accent/40',
          archived && 'opacity-70',
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground"
        >
          <CustomFieldTypeIcon type={definition.type} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 pr-14">
          <span className="block truncate text-sm font-medium" title={definition.name}>
            {definition.name}
          </span>
          <span className="mt-0.5 block truncate text-label-sm text-muted-foreground">
            {ui.customFields.types[definition.type]}
            {defaultText ? ` · ${ui.customFields.list.defaultPrefix}: ${defaultText}` : ''}
          </span>
        </span>
      </button>
      {canManage ? (
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
          {!archived ? (
            <button
              type="button"
              aria-label={ui.customFields.list.reorder}
              title={ui.customFields.list.reorder}
              className="cursor-grab touch-none rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={ui.common.rowMenu}
              className={cn(
                'rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100',
                selected && 'opacity-100',
              )}
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onArchive}>
                {archived ? (
                  <ArchiveRestore className="size-3.5" />
                ) : (
                  <Archive className="size-3.5" />
                )}
                {archived ? ui.customFields.editor.restore : ui.customFields.editor.archive}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}
