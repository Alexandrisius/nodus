import type { CreationFieldSlot, CustomFieldDefinition } from '@nodus/contracts';
import { presetAllowed, requiredAllowed, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { Switch } from '@nodus/ui/components/switch';
import { cn } from '@nodus/ui/lib/utils';
import { ChevronRight, GripVertical, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { CustomFieldEditor } from '../../../../../shared/custom-fields/value-editor.js';
import { useUsersList } from '../../../../../shared/api/users-list.js';
import { FilterCombobox } from '../../../../../shared/views/filter-combobox.js';
import { ProjectPicker } from '../../../../../shared/ui/project-picker.js';
import type { SlotPatch } from '../../../model/creation-form.js';

/**
 * Строка слота формы создания (#432, Р12): ручка перетаскивания, подпись,
 * значки «Обязательно» / «Скрыто: значение»; раскрытие — своё название,
 * обязательность, скрытое значение с редактором, «Убрать». Правила полей —
 * общая грамматика contracts (`requiredAllowed`, `presetAllowed`): у
 * ответственного и приоритета нет обязательности, у срока — скрытого
 * значения.
 */
export function CreationSlotRow({
  slot,
  label,
  definition,
  readOnly,
  expanded,
  invalid,
  onToggle,
  onChange,
  onRemove,
}: {
  slot: CreationFieldSlot;
  label: string;
  definition?: CustomFieldDefinition;
  readOnly: boolean;
  expanded: boolean;
  /** Проблема публикации у слота — строка подсвечена. */
  invalid: boolean;
  onToggle: () => void;
  onChange: (patch: SlotPatch) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.key,
    disabled: readOnly,
  });
  const canRequire = requiredAllowed(slot.key) && slot.preset === null;
  const canHide = presetAllowed(slot.key);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'rounded-lg border border-border bg-card',
        isDragging && 'z-10 opacity-90',
        invalid && 'border-danger',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-1">
        <button
          type="button"
          className={cn(
            'shrink-0 rounded-md p-1 text-muted-foreground',
            readOnly ? 'cursor-default opacity-40' : 'cursor-grab hover:bg-accent',
          )}
          aria-label={ui.automation.creation.dragHandle}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90',
            )}
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-sm">{label}</span>
          {slot.required ? <Badge>{ui.automation.creation.requiredBadge}</Badge> : null}
          {slot.preset !== null ? (
            <Badge>
              {ui.automation.creation.hiddenBadge} {presetText(slot)}
            </Badge>
          ) : null}
        </button>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted-foreground">
              {ui.automation.creation.labelTitle}
            </span>
            <Input
              value={slot.label ?? ''}
              maxLength={60}
              readOnly={readOnly}
              placeholder={label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">
              {ui.automation.creation.labelHint}
            </span>
          </label>

          <label className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{ui.automation.creation.required}</span>
              <span className="text-xs text-muted-foreground">
                {requiredAllowed(slot.key)
                  ? ui.automation.creation.requiredHint
                  : ui.automation.creation.requiredAlways}
              </span>
            </span>
            <Switch
              checked={slot.required}
              disabled={readOnly || !canRequire}
              onCheckedChange={(checked) => onChange({ required: checked })}
            />
          </label>

          <label className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{ui.automation.creation.hideTitle}</span>
              <span className="text-xs text-muted-foreground">
                {canHide ? ui.automation.creation.hideHint : ui.automation.creation.hideNotAllowed}
              </span>
            </span>
            <Switch
              checked={slot.preset !== null}
              disabled={readOnly || !canHide}
              onCheckedChange={(checked) => onChange({ preset: checked ? '' : null })}
            />
          </label>

          {slot.preset !== null ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">
                {ui.automation.creation.preset}
              </span>
              <PresetEditor
                slot={slot}
                definition={definition}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({ preset: (value ?? '') as CreationFieldSlot['preset'] })
                }
              />
            </div>
          ) : null}

          {readOnly ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto justify-start self-start py-1.5 text-danger hover:text-danger"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
              {ui.automation.creation.remove}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

/** Короткая подпись скрытого значения в строке слота. */
function presetText(slot: CreationFieldSlot): string {
  const value = slot.preset;
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'boolean') return value ? ui.automation.creation.presetBool : '—';
  if (typeof value === 'object' && value !== null) return ui.automation.creation.presetMoney;
  return String(value ?? '').slice(0, 24);
}

/** Редактор скрытого значения: атрибуты — общий редактор значений (#431),
 *  системные поля — свои контролы. */
function PresetEditor({
  slot,
  definition,
  readOnly,
  onChange,
}: {
  slot: CreationFieldSlot;
  definition?: CustomFieldDefinition;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}) {
  const { data: users } = useUsersList();
  if (definition) {
    return (
      <CustomFieldEditor
        definition={definition}
        value={(slot.preset ?? undefined) as never}
        refs={[]}
        disabled={readOnly}
        variant="form"
        onCommit={(value) => onChange(value)}
      />
    );
  }
  switch (slot.key) {
    case 'description':
      return (
        <Input
          value={typeof slot.preset === 'string' ? slot.preset : ''}
          readOnly={readOnly}
          maxLength={5000}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'priority':
      return (
        <PrioritySelect
          value={typeof slot.preset === 'string' ? slot.preset : ''}
          onChange={onChange}
        />
      );
    case 'assignee':
      return (
        <FilterCombobox
          options={(users?.items ?? []).map((user) => ({
            value: user.id,
            label: user.displayName,
            avatarUrl: user.avatarUrl ?? null,
          }))}
          value={typeof slot.preset === 'string' ? slot.preset : undefined}
          onChange={(id) => onChange(id ?? null)}
          ariaLabel={ui.automation.creation.presetUser}
          placeholder={ui.automation.creation.presetEmpty}
        />
      );
    case 'project':
      return (
        <ProjectPicker
          value={typeof slot.preset === 'string' ? slot.preset : undefined}
          onChange={(id) => onChange(id ?? null)}
          ariaLabel={ui.automation.creation.presetProject}
        />
      );
    default:
      return (
        <p className="text-xs text-muted-foreground">{ui.automation.creation.presetUnavailable}</p>
      );
  }
}

function PrioritySelect({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const options = ['low', 'normal', 'high', 'urgent'] as const;
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? 'default' : 'outline'}
          onClick={() => onChange(option)}
        >
          {ui.tasks.priority[option]}
        </Button>
      ))}
    </div>
  );
}
