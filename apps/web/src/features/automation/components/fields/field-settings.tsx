import type { CustomFieldSettings } from '@nodus/contracts';
import { SystemDictionary, ui } from '@nodus/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

import { useDictionaryItems } from '../../../../shared/dictionaries/queries.js';
import type { FieldFamily } from '../../lib/field-type-families.js';

/** Настройки типа (#431, Р1): точность числа, валюта денег. Справочник
 *  списка выбирается при создании и после не меняется (Р3). */
export function FieldSettings({
  family,
  settings,
  disabled,
  onChange,
}: {
  family: FieldFamily;
  settings: CustomFieldSettings;
  disabled: boolean;
  onChange: (next: CustomFieldSettings) => void;
}) {
  if (family === 'number') {
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm">{ui.customFields.editor.precision}</span>
        <Select
          value={String(settings.precision ?? 0)}
          disabled={disabled}
          onValueChange={(value) => onChange({ ...settings, precision: Number(value) })}
        >
          <SelectTrigger className="w-24" aria-label={ui.customFields.editor.precision}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 7 }, (_, value) => (
              <SelectItem key={value} value={String(value)}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }
  if (family === 'money') {
    return <CurrencySelect settings={settings} disabled={disabled} onChange={onChange} />;
  }
  return null;
}

function CurrencySelect({
  settings,
  disabled,
  onChange,
}: {
  settings: CustomFieldSettings;
  disabled: boolean;
  onChange: (next: CustomFieldSettings) => void;
}) {
  const { data: currencies = [] } = useDictionaryItems(SystemDictionary.CURRENCY);
  const active = currencies.filter((currency) => currency.isActive);
  const value =
    settings.currencyId ?? active.find((currency) => currency.name === 'BYN')?.id ?? active[0]?.id;
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm">{ui.customFields.editor.currency}</span>
      <Select
        value={value}
        disabled={disabled || active.length === 0}
        onValueChange={(id) => onChange({ ...settings, currencyId: id })}
      >
        <SelectTrigger className="w-28" aria-label={ui.customFields.editor.currency}>
          <SelectValue placeholder={ui.customFields.editor.currency} />
        </SelectTrigger>
        <SelectContent>
          {active.map((currency) => (
            <SelectItem key={currency.id} value={currency.id}>
              {currency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
