import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';

import { type EditorProps } from './editor-kit.js';

/**
 * Флаг: хранится только `true`, снятие — `null` (Р1). Галочка меняется
 * мгновенно (оптимистичная правка карточки), подпись — имя поля.
 */
export function BoolEditor(props: EditorProps) {
  const checked = props.value === true;
  return (
    <label className="flex min-h-7 items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={props.disabled}
        aria-label={props.definition.name}
        onCheckedChange={(next) => props.onCommit(next === true ? true : null)}
      />
      <span className={checked ? undefined : 'text-muted-foreground'}>
        {checked ? ui.customFields.value.yes : ui.customFields.value.no}
      </span>
    </label>
  );
}
