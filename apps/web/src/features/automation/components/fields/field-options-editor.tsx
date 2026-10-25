import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, ArchiveRestore, GripVertical, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CustomFieldDefinition, DictionaryItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';

import {
  useArchiveDictionaryItem,
  useCreateDictionaryItem,
  useReorderDictionaryItems,
  useUpdateDictionaryItem,
} from '../../api/dictionaries-api.js';
import { useDictionaryItems } from '../../../../shared/dictionaries/queries.js';

/**
 * Варианты списка (#431, Р10): справочник поля, правка по месту —
 * добавить, переименовать, порядок перетаскиванием (dnd-kit, клавиатура),
 * архив и возврат. Подписи меняются во всех полях с этим списком —
 * честная подсказка, когда справочник общий.
 */
export function FieldOptionsEditor({
  definition,
  shared,
  disabled,
}: {
  definition: CustomFieldDefinition;
  shared: boolean;
  disabled: boolean;
}) {
  const code = definition.dictionary?.code ?? '';
  const { data: items = [] } = useDictionaryItems(code || null, { includeArchived: true });
  const create = useCreateDictionaryItem(code);
  const update = useUpdateDictionaryItem(code);
  const reorder = useReorderDictionaryItems(code);
  const archive = useArchiveDictionaryItem(code);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const active = items.filter((item) => item.isActive);
  const archived = items.filter((item) => !item.isActive);

  function add() {
    const name = draft.trim();
    if (!name || create.isPending) return;
    create.mutate({ name }, { onSuccess: () => setDraft('') });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const from = active.findIndex((item) => item.id === dragged.id);
    const to = active.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(active, from, to);
    reorder.mutate({ ids: next.map((item) => item.id) });
  }

  return (
    <div className="flex flex-col gap-2">
      {shared ? (
        <p className="text-xs text-muted-foreground">{ui.customFields.editor.optionsShared}</p>
      ) : null}
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">{ui.customFields.editor.optionEmpty}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={active.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1">
              {active.map((item) => (
                <SortableOption
                  key={item.id}
                  item={item}
                  disabled={disabled}
                  editing={editingId === item.id}
                  onEdit={() => setEditingId(item.id)}
                  onRename={(name) => {
                    update.mutate({ id: item.id, body: { name } });
                    setEditingId(null);
                  }}
                  onArchive={() => archive.mutate({ id: item.id, archived: true })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!disabled ? (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            maxLength={120}
            placeholder={ui.customFields.editor.optionPlaceholder}
            aria-label={ui.customFields.editor.optionAdd}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            className="h-8 flex-1 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim() || create.isPending}
            aria-label={ui.customFields.editor.optionAdd}
            title={ui.customFields.editor.optionAdd}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      {archived.length > 0 ? (
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {ui.customFields.list.archiveGroup} · {archived.length}
          </span>
          {archived.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => archive.mutate({ id: item.id, archived: false })}
                  aria-label={ui.customFields.editor.optionRestore}
                  title={ui.customFields.editor.optionRestore}
                  className="rounded p-1 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArchiveRestore className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SortableOption({
  item,
  disabled,
  editing,
  onEdit,
  onRename,
  onArchive,
}: {
  item: DictionaryItem;
  disabled: boolean;
  editing: boolean;
  onEdit: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  const [text, setText] = useState(item.name);
  useEffect(() => setText(item.name), [item.name]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/option flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40',
        isDragging && 'bg-accent',
      )}
    >
      {!disabled ? (
        <button
          type="button"
          aria-label={ui.customFields.list.reorder}
          title={ui.customFields.list.reorder}
          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/option:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      {editing && !disabled ? (
        <Input
          autoFocus
          defaultValue={item.name}
          maxLength={120}
          aria-label={ui.customFields.editor.optionRename}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onRename(text.trim() || item.name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onRename(text.trim() || item.name);
            }
            if (e.key === 'Escape') onRename(item.name);
          }}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="min-w-0 flex-1 truncate text-left"
        >
          {item.name}
        </button>
      )}
      {!disabled ? (
        <button
          type="button"
          onClick={onArchive}
          aria-label={ui.customFields.editor.optionArchive}
          title={ui.customFields.editor.optionArchive}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/option:opacity-100 focus-visible:opacity-100 hover:text-foreground"
        >
          <Archive className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
