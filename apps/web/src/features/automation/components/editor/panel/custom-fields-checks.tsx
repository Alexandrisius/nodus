import type { CustomFieldDefinition, CustomFieldKey, CustomFieldScope } from '@nodus/contracts';
import { customFieldIdOfKey, customFieldKey, ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';

import {
  activeDefinitions,
  useCustomFieldDefinitions,
} from '../../../../../shared/custom-fields/queries.js';

/**
 * Подгруппа «Поля процесса» в панели кнопки (#431, Р7): флажки полей области
 * в разделах «Окно перехода → Поля» и «Условия → Заполнены поля». Архивное
 * поле, уже выбранное, остаётся видимым с пометкой (его можно снять);
 * выбрать новое архивное нельзя. Пусто — ссылка во вкладку «Поля».
 */
export function CustomFieldChecks({
  scope,
  selected,
  disabled,
  limit,
  limitHint = ui.automation.window.fieldsLimit,
  onToggle,
}: {
  scope: CustomFieldScope;
  selected: readonly string[];
  disabled: boolean;
  limit: number;
  limitHint?: string;
  onToggle: (key: CustomFieldKey) => void;
}) {
  const { data } = useCustomFieldDefinitions(scope);
  const active = activeDefinitions(data);
  const archived = (data ?? []).filter(
    (definition) =>
      definition.archivedAt !== null &&
      selected.some((key) => customFieldIdOfKey(key) === definition.id),
  );
  const atLimit = selected.length >= limit;

  if (active.length === 0 && archived.length === 0) {
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

  const row = (definition: CustomFieldDefinition, isArchived: boolean) => {
    const key = customFieldKey(definition.id);
    const checked = selected.includes(key);
    return (
      <label key={definition.id} className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          disabled={disabled || (isArchived && !checked) || (!checked && atLimit)}
          onCheckedChange={() => onToggle(key)}
        />
        <span className={isArchived ? 'text-muted-foreground' : undefined}>
          {definition.name}
          {isArchived ? ` ${ui.automation.window.customFieldsArchived}` : ''}
        </span>
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {ui.automation.window.customFieldsGroup}
      </span>
      {active.map((definition) => row(definition, false))}
      {archived.map((definition) => row(definition, true))}
      {atLimit ? <p className="text-xs text-muted-foreground">{limitHint}</p> : null}
    </div>
  );
}
