import { Check, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { cn } from '@nodus/ui/lib/utils';

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
      {/* Левая колонка — пресеты: быстрое применение (модель Битрикс24) */}
      <div className="flex w-44 shrink-0 flex-col border-r border-border py-1.5">
        {allPresets.map((preset) => {
          const active = sameFilterState(toolbar.filters, preset.state);
          const pinned = toolbar.pinnedId === preset.id;
          const isBuiltin = builtinPresets.some((b) => b.id === preset.id);
          return (
            <div
              key={preset.id}
              className="group flex items-center gap-0.5 rounded-md px-1.5 py-0.5 hover:bg-accent/50"
            >
              <button
                type="button"
                onClick={() => toolbar.setFilters(preset.state)}
                title={preset.name}
                className={cn(
                  'min-w-0 flex-1 truncate text-left text-sm',
                  active ? 'font-medium text-port' : 'text-secondary-foreground',
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
            <div className="flex items-center gap-1">
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
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm text-muted-foreground hover:text-foreground"
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

/** Контрол одного поля фильтра по его типу. */
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
    const options = def.options ?? [];
    return (
      <label className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-xs text-muted-foreground">{def.label}</span>
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v === '' ? undefined : v)}
        >
          <SelectTrigger className="h-8 flex-1 text-sm" aria-label={def.label}>
            <SelectValue placeholder={ui.filters.any} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }
  if (def.type === 'dateRange') {
    const range = typeof value === 'object' && value !== undefined ? value : {};
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-xs text-muted-foreground">{def.label}</span>
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
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{def.label}</span>
      <Input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={def.placeholder}
        className="h-8 flex-1 text-sm"
      />
    </label>
  );
}
