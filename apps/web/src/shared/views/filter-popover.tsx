import { Check, Funnel, Pin, PinOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { cn } from '@nodus/ui/lib/utils';

import type { FilterFieldDef, FilterValue } from './list-filters.js';
import { activeFiltersCount } from './list-filters.js';
import type { ListToolbarState } from './use-list-toolbar.js';

/**
 * Панель фильтра списка (модель Битрикс24): поля по атрибутам из реестра,
 * применение мгновенное (оптимистичный UI), «Сохранить фильтр» со скрепкой
 * (закреплённый применяется по умолчанию при открытии списка). Активные
 * фильтры — счётчиком на кнопке и чипами в строке (ListToolbar).
 */
export function FilterPopover<T>({
  toolbar,
  defs,
}: {
  toolbar: ListToolbarState;
  defs: FilterFieldDef<T>[];
}) {
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState('');
  const count = activeFiltersCount(defs, toolbar.filters);

  function submitPreset() {
    const name = presetName.trim();
    if (!name) return;
    toolbar.savePreset(name);
    setPresetName('');
    setNaming(false);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1.5', count > 0 && 'border-port/60 text-foreground')}
          aria-label={ui.filters.title}
        >
          <Funnel className="size-3.5" strokeWidth={1.75} />
          {ui.filters.title}
          {count > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-port font-mono text-[10px] text-white tabular-nums">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-2.5">
          {defs.map((def) => (
            <FilterFieldControl
              key={def.id}
              def={def}
              value={toolbar.filters[def.id]}
              onChange={(v) => toolbar.setFilter(def.id, v)}
            />
          ))}
          <div className="flex items-center gap-2 border-t border-border pt-2.5">
            <Button variant="ghost" size="sm" className="h-7" onClick={toolbar.resetAll}>
              {ui.filters.reset}
            </Button>
            {naming ? (
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
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7"
                disabled={count === 0}
                onClick={() => setNaming(true)}
              >
                {ui.filters.save}
              </Button>
            )}
            {naming ? (
              <Button
                size="sm"
                className="h-7"
                disabled={!presetName.trim()}
                onClick={submitPreset}
              >
                <Check className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {toolbar.presets.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-t border-border pt-2">
              <span className="px-1 pb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                {ui.filters.saved}
              </span>
              {toolbar.presets.map((preset) => (
                <div
                  key={preset.id}
                  className="group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/50"
                >
                  <button
                    type="button"
                    onClick={() => toolbar.applyPreset(preset.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    title={preset.name}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => toolbar.togglePin(preset.id)}
                    aria-label={preset.pinned ? ui.filters.unpin : ui.filters.pin}
                    title={preset.pinned ? ui.filters.unpin : ui.filters.pin}
                    className={cn(
                      'shrink-0 rounded p-1 transition-opacity',
                      preset.pinned
                        ? 'text-port'
                        : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                    )}
                  >
                    {preset.pinned ? (
                      <PinOff className="size-3.5" strokeWidth={1.75} />
                    ) : (
                      <Pin className="size-3.5" strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toolbar.deletePreset(preset.id)}
                    aria-label={ui.filters.deletePreset}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
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
