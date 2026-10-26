import type { CustomFieldDefinition, CustomFieldKey, CustomFieldScope } from '@nodus/contracts';
import { customFieldIdOfKey, customFieldKey, typeIdsOf, ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';

import { useCustomFieldDefinitions } from '../../../../../shared/custom-fields/queries.js';

/**
 * Подгруппа «Атрибуты» в панели кнопки (#431, Р7): флажки атрибутов
 * области в разделах «Окно перехода → Поля» и «Условия → Заполнены поля».
 * Скрытый (служебный) атрибут: в условии выбирается свободно (значение
 * ставит автоматика), в окне — нет (окно его не покажет); уже выбранный в
 * окне остаётся видимым с пометкой «скрыт», чтобы его можно было снять.
 * Пусто — ссылка во вкладку «Атрибуты».
 */
export function CustomFieldChecks({
  scope,
  typeId,
  selected,
  disabled,
  limit,
  limitHint = ui.automation.window.fieldsLimit,
  includeHidden = false,
  onToggle,
}: {
  scope: CustomFieldScope;
  /** Тип процесса: выбираются только привязанные к нему атрибуты (#432, Р8). */
  typeId?: string;
  selected: readonly string[];
  disabled: boolean;
  limit: number;
  limitHint?: string;
  /** Условие гейта: скрытые атрибуты выбираются наравне с видимыми. */
  includeHidden?: boolean;
  onToggle: (key: CustomFieldKey) => void;
}) {
  const { data = [] } = useCustomFieldDefinitions(scope);
  const isSelected = (definition: CustomFieldDefinition) =>
    selected.some((key) => customFieldIdOfKey(key) === definition.id);
  const typed = scope === 'task' || scope === 'letter';
  const shown = data.filter(
    (definition) =>
      (!typeId || !typed || typeIdsOf(definition).includes(typeId) || isSelected(definition)) &&
      (includeHidden || !definition.hidden || isSelected(definition)),
  );
  const atLimit = selected.length >= limit;

  if (shown.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {ui.automation.window.customFieldsGroup}
        </span>
        <a
          href={`/automation?tab=fields&scope=${scope}`}
          className="text-xs text-info underline-offset-2 hover:underline"
        >
          {ui.automation.window.customFieldsEmpty}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {ui.automation.window.customFieldsGroup}
      </span>
      {shown.map((definition) => {
        const key = customFieldKey(definition.id);
        const checked = selected.includes(key);
        const blockedHidden = definition.hidden && !includeHidden;
        return (
          <label key={definition.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={checked}
              disabled={disabled || (blockedHidden && !checked) || (!checked && atLimit)}
              onCheckedChange={() => onToggle(key)}
            />
            <span className={definition.hidden ? 'text-muted-foreground' : undefined}>
              {definition.name}
              {definition.hidden ? ` · ${ui.automation.window.customFieldsHidden}` : ''}
            </span>
          </label>
        );
      })}
      {atLimit ? <p className="text-xs text-muted-foreground">{limitHint}</p> : null}
    </div>
  );
}
