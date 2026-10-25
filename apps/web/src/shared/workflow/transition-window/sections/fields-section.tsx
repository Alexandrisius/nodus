import type { EffectiveSection, TransitionWindowField } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { Textarea } from '@nodus/ui/components/textarea';

import { formatDuration, parseDuration } from '../../../lib/minutes.js';
import { useUsersList } from '../../../api/users-list.js';
import { DateTimePicker } from '../../../ui/date-time-picker.js';
import { PeoplePicker } from '../../../ui/people-picker.js';
import type { WindowDraft } from '../use-window-draft.js';
import type { TransitionWindowContext, WindowFieldValues } from '../window-context.js';

/** «Дозаполнить поля»: текущие значения, меняются только выбранные в окне. */
export function FieldsSection({
  section,
  context,
  draft,
  setFields,
  disabled,
}: {
  section: Extract<EffectiveSection, { kind: 'fields' }>;
  context: TransitionWindowContext;
  draft: WindowDraft;
  setFields: (fields: WindowFieldValues) => void;
  disabled: boolean;
}) {
  const patch = (next: Partial<WindowFieldValues>) => setFields({ ...draft.fields, ...next });
  const editable = !disabled && context.access.canEdit;

  return (
    <div className="flex flex-col gap-3">
      {section.fields.map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{labelOf(field)}</span>
          <FieldEditor field={field} value={draft.fields} editable={editable} onChange={patch} />
        </div>
      ))}
    </div>
  );
}

function labelOf(field: TransitionWindowField): string {
  switch (field) {
    case 'description':
      return ui.tasks.description;
    case 'deadline':
      return ui.tasks.deadline;
    case 'assignee':
      return ui.tasks.assignee;
    case 'plannedMinutes':
      return ui.tasks.plannedTime;
  }
}

function FieldEditor({
  field,
  value,
  editable,
  onChange,
}: {
  field: TransitionWindowField;
  value: WindowFieldValues;
  editable: boolean;
  onChange: (next: Partial<WindowFieldValues>) => void;
}) {
  switch (field) {
    case 'description':
      return (
        <Textarea
          value={value.description}
          readOnly={!editable}
          maxLength={5000}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={ui.tasks.descriptionPlaceholder}
          aria-label={ui.tasks.description}
          className="min-h-16 text-sm [field-sizing:content]"
        />
      );
    case 'deadline':
      return (
        <DateTimePicker
          value={value.deadline ? new Date(value.deadline) : null}
          onChange={(date) => onChange({ deadline: date ? date.toISOString() : null })}
          ariaLabel={ui.tasks.deadline}
          clearLabel={ui.tasks.removeDeadline}
        >
          <Button type="button" variant="outline" disabled={!editable} className="justify-start">
            {value.deadline
              ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
                  new Date(value.deadline),
                )
              : ui.tasks.deadline}
          </Button>
        </DateTimePicker>
      );
    case 'assignee':
      return <AssigneeField value={value.assigneeId} editable={editable} onChange={onChange} />;
    case 'plannedMinutes':
      return (
        <MinutesField
          value={value.plannedMinutes}
          editable={editable}
          onChange={(minutes) => onChange({ plannedMinutes: minutes })}
        />
      );
  }
}

function AssigneeField({
  value,
  editable,
  onChange,
}: {
  value: string | null;
  editable: boolean;
  onChange: (next: Partial<WindowFieldValues>) => void;
}) {
  const { data } = useUsersList();
  const current = value ? data?.items.find((u) => u.id === value) : undefined;
  return (
    <PeoplePicker
      selectedIds={value ? [value] : []}
      onToggle={(userId) => onChange({ assigneeId: userId })}
      ariaLabel={ui.tasks.assignee}
    >
      <Button type="button" variant="outline" disabled={!editable} className="justify-start">
        {current ? current.displayName : ui.common.notSet}
      </Button>
    </PeoplePicker>
  );
}

function MinutesField({
  value,
  editable,
  onChange,
}: {
  value: number | null;
  editable: boolean;
  onChange: (minutes: number | null) => void;
}) {
  return (
    <Input
      defaultValue={
        value === null ? '' : formatDuration(value, ui.tasks.hoursShort, ui.tasks.minutesShort)
      }
      readOnly={!editable}
      placeholder={ui.tasks.plannedPlaceholder}
      aria-label={ui.tasks.plannedTime}
      className="h-8 w-40 text-sm"
      onBlur={(e) => onChange(parseDuration(e.target.value))}
    />
  );
}
