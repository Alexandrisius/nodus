import { Check, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { FilterCombobox } from './filter-combobox.js';
import type {
  DateRangeValue,
  FilterFieldDef,
  FilterValue,
  NumberRangeValue,
} from './list-filters.js';
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
    <div className="flex max-h-[var(--radix-popover-content-available-height)] min-h-0">
      {/* Левая колонка — пресеты: быстрое применение (модель Битрикс24).
          Зона отделена тоном (bg-muted/40) и кеглем 13px — единым с подписями
          полей справа, чтобы колонки читались одним приложением. */}
      <div className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/40 py-1.5">
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
                  'min-w-0 flex-1 truncate text-left text-body-xs leading-5',
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
                  pinned
                    ? 'text-port'
                    : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
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
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
                >
                  <Trash2 className="size-3" strokeWidth={1.75} />
                </button>
              )}
            </div>
          );
        })}
        <div className="mt-1 px-1.5 pt-1.5">
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
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-body-xs leading-5 text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              {ui.filters.save}
            </button>
          )}
        </div>
      </div>

      {/* Правая колонка — поля фильтра по атрибутам (мгновенное применение).
          Поля с группой идут подряд под моно-заголовком (кастомные — «Поля», #431). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {visibleDefs.map((def, index) => {
          const newGroup = def.group !== undefined && def.group !== visibleDefs[index - 1]?.group;
          return (
            <div key={def.id} className="flex flex-col gap-2.5">
              {newGroup ? <NodeLabel label={def.group!} className="pt-1" /> : null}
              <FilterFieldControl
                def={def}
                value={toolbar.filters[def.id]}
                onChange={(v) => toolbar.setFilter(def.id, v)}
              />
            </div>
          );
        })}
        <div className="flex items-center pt-2.5">
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
        <span className="w-28 shrink-0 text-body-xs text-muted-foreground">{def.label}</span>
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
    const range: DateRangeValue =
      typeof value === 'object' && value !== undefined ? (value as DateRangeValue) : {};
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-body-xs text-muted-foreground">{def.label}</span>
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
  if (def.type === 'numberRange') {
    return <NumberRangeControl def={def} value={value} onChange={onChange} />;
  }
  return (
    <label className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-body-xs text-muted-foreground">{def.label}</span>
      <Input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={def.placeholder}
        className="h-8 flex-1 text-sm"
      />
    </label>
  );
}

/** Диапазон чисел (кастомные «Число», «Деньги», «Продолжительность», #431):
 *  у продолжительности ввод и показ — «ч:мм», хранение — минуты. */
function NumberRangeControl<T>({
  def,
  value,
  onChange,
}: {
  def: FilterFieldDef<T>;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const range: NumberRangeValue =
    typeof value === 'object' && value !== undefined ? (value as NumberRangeValue) : {};
  const duration = def.numberFormat === 'duration';
  const [fromText, setFromText] = useState(
    duration
      ? range.from !== undefined
        ? formatDurationFilter(range.from)
        : ''
      : (range.from ?? '').toString(),
  );
  const [toText, setToText] = useState(
    duration
      ? range.to !== undefined
        ? formatDurationFilter(range.to)
        : ''
      : (range.to ?? '').toString(),
  );

  // Пресет/«Сбросить» меняют значение снаружи — поля догоняют (иначе чип
  // активен, а ввод пустой). Сравниваем по разобранным значениям.
  useEffect(() => {
    if (parse(fromText) !== range.from) {
      setFromText(
        duration && range.from !== undefined
          ? formatDurationFilter(range.from)
          : (range.from ?? '').toString(),
      );
    }
    if (parse(toText) !== range.to) {
      setToText(
        duration && range.to !== undefined
          ? formatDurationFilter(range.to)
          : (range.to ?? '').toString(),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- текст — локальный ввод
  }, [range.from, range.to, duration]);

  const parse = (text: string): number | undefined => {
    const trimmed = text.trim();
    if (trimmed === '') return undefined;
    if (duration) {
      const match = /^(\d{1,5})(?::(\d{1,2}))?$/.exec(trimmed);
      if (!match) return undefined;
      return Number(match[1]) * 60 + (match[2] ? Number(match[2]) : 0);
    }
    const normalized = trimmed.replace(/[\s\u00a0]/g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
  };

  const emit = (from: string, to: string) => {
    const next = { from: parse(from), to: parse(to) };
    onChange(next.from === undefined && next.to === undefined ? undefined : next);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-body-xs text-muted-foreground">{def.label}</span>
      <Input
        value={fromText}
        inputMode={duration ? 'text' : 'decimal'}
        placeholder={ui.filters.numberFrom}
        aria-label={`${def.label}: ${ui.filters.numberFrom}`}
        onChange={(e) => {
          setFromText(e.target.value);
          emit(e.target.value, toText);
        }}
        className="h-8 flex-1 text-sm tabular-nums"
      />
      <Input
        value={toText}
        inputMode={duration ? 'text' : 'decimal'}
        placeholder={ui.filters.numberTo}
        aria-label={`${def.label}: ${ui.filters.numberTo}`}
        onChange={(e) => {
          setToText(e.target.value);
          emit(fromText, e.target.value);
        }}
        className="h-8 flex-1 text-sm tabular-nums"
      />
    </div>
  );
}

function formatDurationFilter(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
