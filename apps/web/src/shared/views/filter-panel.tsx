import { Check, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';

import { FilterCombobox } from './filter-combobox.js';
import type { FilterFieldDef, FilterValue } from './list-filters.js';
import { sameFilterState } from './list-filters.js';
import type { FilterPreset, ListToolbarState } from './use-list-toolbar.js';

/**
 * Панель фильтра списка (модель Битрикс24): выезжает ИЗ поисковой строки
 * (отдельной кнопки «Фильтр» нет). Слева — колонка ПРЕСЕТОВ (встроенные +
 * сохранённые): быстрое применение кликом, активный подсвечен, «скрепка»
 * закрепляет пресет по умолчанию, свои можно удалять; внизу — «Сохранить
 * фильтр». Справа — поля фильтра по атрибутам из реестра (применение
 * мгновенное, оптимистичный UI), «Сбросить». Скрытые служебные поля
 * (hidden — напр. «Просроченные») в панель не выводятся.
 */
export function FilterPanel<T>({
  toolbar,
  defs,
  builtinPresets,
}: {
  toolbar: ListToolbarState;
  defs: FilterFieldDef<T>[];
  builtinPresets: FilterPreset[];
}) {
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState('');
  const visibleDefs = defs.filter((d) => !d.hidden);
  const allPresets = [...builtinPresets, ...toolbar.presets];

  function submitPreset() {
    const name = presetName.trim();
    if (!name) return;
    toolbar.savePreset(name);
    setPresetName('');
    setNaming(false);
  }

  return (
    <div className="flex">
      {/* Левая колонка — пресеты: быстрое применение (модель Битрикс24).
          Зона отделена тоном (bg-muted/40) и кеглем 13px — единым с подписями
          полей справа, чтобы колонки читались одним приложением. */}
      <div className="flex w-44 shrink-0 flex-col border-r border-border bg-muted/40 py-1.5">
        {allPresets.map((preset) => {
          const active = sameFilterState(toolbar.filters, preset.state);
          const pinned = toolbar.pinnedId === preset.id;
          const isBuiltin = builtinPresets.some((b) => b.id === preset.id);
          return (
            <div
              key={preset.id}
              className={cn(
                'group mx-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent/60',
                active && 'bg-accent',
              )}
            >
              <button
                type="button"
                onClick={() => toolbar.setFilters(preset.state)}
                title={preset.name}
                className={cn(
                  'min-w-0 flex-1 truncate text-left text-[13px] leading-5',
                  active ? 'font-medium text-foreground' : 'text-secondary-foreground',
                )}
              >
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => toolbar.togglePin(preset.id)}
                aria-label={pinned ? ui.filters.unpin : ui.filters.pin}
                title={pinned ? ui.filters.unpin : ui.filters.pin}
                className={cn(
                  'shrink-0 rounded p-1 transition-opacity',
                  pinned ? 'text-port' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                )}
              >
                {pinned ? (
                  <PinOff className="size-3" strokeWidth={1.75} />
                ) : (
                  <Pin className="size-3" strokeWidth={1.75} />
                )}
              </button>
              {isBuiltin ? null : (
                <button
                  type="button"
                  onClick={() => toolbar.deletePreset(preset.id)}
                  aria-label={ui.filters.deletePreset}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                >
                  <Trash2 className="size-3" strokeWidth={1.75} />
                </button>
              )}
            </div>
          );
        })}
        <div className="mt-1 border-t border-border px-1.5 pt-1.5">
          {naming ? (
            <div className="flex items-center gap-1 px-1.5">
              <Input
                autoFocus
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitPreset();
                  }
                  if (e.key === 'Escape') setNaming(false);
                }}
                placeholder={ui.filters.savePlaceholder}
                className="h-7 text-sm"
              />
              <Button
                size="sm"
                className="size-7 shrink-0 p-0"
                disabled={!presetName.trim()}
                onClick={submitPreset}
                aria-label={ui.filters.save}
              >
                <Check className="size-3.5" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              {ui.filters.save}
            </button>
          )}
        </div>
      </div>

      {/* Правая колонка — поля фильтра по атрибутам (мгновенное применение) */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3">
        {visibleDefs.map((def) => (
          <FilterFieldControl
            key={def.id}
            def={def}
            value={toolbar.filters[def.id]}
            onChange={(v) => toolbar.setFilter(def.id, v)}
          />
        ))}
        <div className="flex items-center border-t border-border pt-2.5">
          <Button variant="ghost" size="sm" className="h-7" onClick={toolbar.resetAll}>
            {ui.filters.reset}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Контрол одного поля фильтра по его типу: справочники — комбобокс с
 *  подсказками (модель Битрикс24), даты — диапазон, строка — инпут. */
function FilterFieldControl<T>({
  def,
  value,
  onChange,
}: {
  def: FilterFieldDef<T>;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  if (def.type === 'select' || def.type === 'person') {
    return (
      <label className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-[13px] text-muted-foreground">{def.label}</span>
        <FilterCombobox
          options={def.options ?? []}
          value={typeof value === 'string' ? value : undefined}
          onChange={(v) => onChange(v)}
          ariaLabel={def.label}
        />
      </label>
    );
  }
  if (def.type === 'dateRange') {
    const range = typeof value === 'object' && value !== undefined ? value : {};
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-[13px] text-muted-foreground">{def.label}</span>
        <Input
          type="date"
          aria-label={`${def.label}: ${ui.filters.dateFrom}`}
          value={range.from ?? ''}
          onChange={(e) => onChange({ ...range, from: e.target.value || undefined })}
          className="h-8 flex-1 text-sm"
        />
        <Input
          type="date"
          aria-label={`${def.label}: ${ui.filters.dateTo}`}
          value={range.to ?? ''}
          onChange={(e) => onChange({ ...range, to: e.target.value || undefined })}
          className="h-8 flex-1 text-sm"
        />
      </div>
    );
  }
  return (
    <label className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[13px] text-muted-foreground">{def.label}</span>
      <Input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={def.placeholder}
        className="h-8 flex-1 text-sm"
      />
    </label>
  );
}
