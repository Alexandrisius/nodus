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
import { GripVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';

import { DRAFT_PREFIX, type OptionDraft } from '../../lib/field-draft.js';

/**
 * Варианты списка в окне атрибута — ЧЕРНОВИК (сервер получит по
 * «Сохранить»): строка = поле ввода названия, порядок перетаскиванием
 * (dnd-kit, клавиатура), отметка «По умолчанию» (модель Битрикс24: у
 * одиночного списка — один вариант, у множественного — несколько) и
 * удаление крестиком — архива у вариантов нет (вердикт владельца 25.10.2026).
 */
export function FieldOptionsEditor({
  options,
  defaultIds,
  multiple,
  disabled,
  invalid,
  onChange,
  onDefaultChange,
}: {
  options: readonly OptionDraft[];
  defaultIds: readonly string[];
  multiple: boolean;
  disabled: boolean;
  invalid: boolean;
  onChange: (options: OptionDraft[]) => void;
  onDefaultChange: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function add() {
    const name = draft.trim();
    if (!name) return;
    onChange([...options, { id: `${DRAFT_PREFIX}${crypto.randomUUID()}`, name }]);
    setDraft('');
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = options.findIndex((option) => option.id === active.id);
    const to = options.findIndex((option) => option.id === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove([...options], from, to));
  }

  function toggleDefault(id: string) {
    const on = defaultIds.includes(id);
    if (multiple) {
      onDefaultChange(on ? defaultIds.filter((value) => value !== id) : [...defaultIds, id]);
    } else {
      onDefaultChange(on ? [] : [id]);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {options.length > 0 ? (
        // Шапка колонок — та же сетка, что у строки: подпись стоит ровно
        // над флажками «По умолчанию».
        <div aria-hidden className="flex items-center gap-1.5">
          <span className="w-4.5 shrink-0" />
          <span className="flex-1" />
          <span className="w-[4.5rem] shrink-0 text-center text-label-sm whitespace-nowrap text-muted-foreground">
            {ui.customFields.dialog.optionDefault}
          </span>
          <span className="w-8 shrink-0" />
        </div>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={options.map((option) => option.id)}
          strategy={verticalListSortingStrategy}
        >
          {options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              disabled={disabled}
              isDefault={defaultIds.includes(option.id)}
              onRename={(name) =>
                onChange(
                  options.map((entry) => (entry.id === option.id ? { ...entry, name } : entry)),
                )
              }
              onToggleDefault={() => toggleDefault(option.id)}
              onDelete={() => {
                onChange(options.filter((entry) => entry.id !== option.id));
                if (defaultIds.includes(option.id)) {
                  onDefaultChange(defaultIds.filter((id) => id !== option.id));
                }
              }}
            />
          ))}
        </SortableContext>
      </DndContext>

      {!disabled ? (
        <div className="flex items-center gap-1.5 pl-6">
          <Input
            value={draft}
            maxLength={120}
            placeholder={ui.customFields.dialog.optionPlaceholder}
            aria-label={ui.customFields.dialog.optionAdd}
            aria-invalid={(invalid && options.length === 0) || undefined}
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
            disabled={!draft.trim()}
            aria-label={ui.customFields.dialog.optionAdd}
            title={ui.customFields.dialog.optionAdd}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OptionRow({
  option,
  disabled,
  isDefault,
  onRename,
  onToggleDefault,
  onDelete,
}: {
  option: OptionDraft;
  disabled: boolean;
  isDefault: boolean;
  onRename: (name: string) => void;
  onToggleDefault: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/option flex items-center gap-1.5 rounded-lg',
        isDragging && 'relative z-10 bg-card',
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={ui.customFields.dialog.optionReorder}
        title={ui.customFields.dialog.optionReorder}
        className="flex w-4.5 shrink-0 cursor-grab touch-none justify-center text-muted-foreground opacity-50 transition-opacity group-hover/option:opacity-100 focus-visible:opacity-100 active:cursor-grabbing disabled:invisible"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" strokeWidth={1.75} />
      </button>
      <Input
        value={option.name}
        maxLength={120}
        disabled={disabled}
        aria-label={ui.customFields.dialog.options}
        aria-invalid={option.name.trim().length === 0 || undefined}
        onChange={(e) => onRename(e.target.value)}
        className="h-8 flex-1 text-sm"
      />
      <span className="flex w-[4.5rem] shrink-0 justify-center">
        <Checkbox
          checked={isDefault}
          disabled={disabled}
          aria-label={ui.customFields.dialog.optionDefault}
          onCheckedChange={onToggleDefault}
        />
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={ui.customFields.dialog.optionDelete}
        title={ui.customFields.dialog.optionDelete}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:invisible"
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
