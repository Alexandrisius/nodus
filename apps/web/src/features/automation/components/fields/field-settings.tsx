import type { ReactNode } from 'react';
import type { CustomFieldSettings } from '@nodus/contracts';
import { SystemDictionary, ui } from '@nodus/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Switch } from '@nodus/ui/components/switch';

import { useDictionaryItems } from '../../../../shared/dictionaries/queries.js';
import { familyModifier, type FieldFamily } from '../../lib/field-type-families.js';

type Settings = Pick<CustomFieldSettings, 'precision' | 'currencyId'>;

/** Строка настройки окна: подпись (+ пояснение) слева, контрол справа. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

/**
 * «Настройки» типа в окне атрибута (#431, Р1/Р3): модификатор семейства
 * («Многострочный» у текста, «Несколько значений» у списка и сотрудника),
 * точность числа, валюта денег. Модификатор у сохранённого атрибута
 * включается в одну сторону (обратно — новым атрибутом): включённый —
 * неактивен, подсказка честная. Нет настроек у типа — секции нет.
 */
export function FieldSettings({
  family,
  settings,
  modifier,
  modifierLocked,
  disabled,
  onSettingsChange,
  onModifierChange,
}: {
  family: FieldFamily;
  settings: Settings;
  modifier: boolean;
  /** Сохранённый атрибут уже с модификатором — выключить нельзя. */
  modifierLocked: boolean;
  disabled: boolean;
  onSettingsChange: (next: Settings) => void;
  onModifierChange: (on: boolean) => void;
}) {
  const kind = familyModifier(family);
  if (!kind && family !== 'number' && family !== 'money') return null;
  const label =
    kind === 'multiline' ? ui.customFields.dialog.multiline : ui.customFields.dialog.multiple;
  const hint = modifierLocked
    ? ui.customFields.dialog.oneWayHint
    : kind === 'multiline'
      ? ui.customFields.dialog.multilineHint
      : ui.customFields.dialog.multipleHint;

  return (
    <div className="flex flex-col gap-3">
      {kind ? (
        <SettingRow label={label} hint={hint}>
          <Switch
            checked={modifier}
            disabled={disabled || modifierLocked}
            aria-label={label}
            onCheckedChange={onModifierChange}
          />
        </SettingRow>
      ) : null}
      {family === 'number' ? (
        <SettingRow label={ui.customFields.dialog.precision}>
          <Select
            value={String(settings.precision ?? 0)}
            disabled={disabled}
            onValueChange={(value) => onSettingsChange({ ...settings, precision: Number(value) })}
          >
            <SelectTrigger className="w-24" aria-label={ui.customFields.dialog.precision}>
              <SelectValue />
            </SelectTrigger>
            {/* `popper`, а не дефолтный item-aligned: меню встаёт ПОД
                контролом (канон селектов портала), а не уезжает к краю окна. */}
            <SelectContent position="popper" align="end" sideOffset={4}>
              {Array.from({ length: 7 }, (_, value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      ) : null}
      {family === 'money' ? (
        <CurrencySelect settings={settings} disabled={disabled} onChange={onSettingsChange} />
      ) : null}
    </div>
  );
}

/** Валюта по умолчанию — BYN (первая системного справочника, Р10). */
export function useDefaultCurrencyId(): string | null {
  const { data: currencies = [] } = useDictionaryItems(SystemDictionary.CURRENCY);
  const active = currencies.filter((currency) => currency.isActive);
  return active.find((currency) => currency.name === 'BYN')?.id ?? active[0]?.id ?? null;
}

function CurrencySelect({
  settings,
  disabled,
  onChange,
}: {
  settings: Settings;
  disabled: boolean;
  onChange: (next: Settings) => void;
}) {
  const { data: currencies = [] } = useDictionaryItems(SystemDictionary.CURRENCY);
  const fallback = useDefaultCurrencyId();
  const active = currencies.filter((currency) => currency.isActive);
  const value = settings.currencyId ?? fallback ?? undefined;
  return (
    <SettingRow label={ui.customFields.dialog.currency}>
      <Select
        value={value}
        disabled={disabled || active.length === 0}
        onValueChange={(id) => onChange({ ...settings, currencyId: id })}
      >
        <SelectTrigger className="w-28" aria-label={ui.customFields.dialog.currency}>
          <SelectValue placeholder={ui.customFields.dialog.currency} />
        </SelectTrigger>
        <SelectContent position="popper" align="end" sideOffset={4}>
          {active.map((currency) => (
            <SelectItem key={currency.id} value={currency.id}>
              {currency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}
