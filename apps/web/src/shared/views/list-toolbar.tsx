import { Search, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { FilterPanel } from './filter-panel.js';
import { filterValueLabel, isActiveFilter, type FilterFieldDef } from './list-filters.js';
import type { FilterPreset, ListToolbarState } from './use-list-toolbar.js';

/**
 * Строка инструментов списка — ЕДИНЫЙ стандарт всех журналов и вкладок-списков
 * («модули не отличаются», вердикт владельца 2026-09-11). Модель Битрикс24:
 * ОДНА поисковая строка (placeholder — короткий «Поиск…»), при фокусе она
 * РАСШИРЯЕТСЯ и из неё выезжает панель фильтра (отдельной кнопки «Фильтр»
 * НЕТ): слева пресеты (быстрое применение, «скрепка» по умолчанию), справа
 * поля по атрибутам. Активные фильтры — съёмными чипами в строке. Слоты:
 * слева — переключатель вида, справа — счётчики/шестерёнка полей.
 * Глобальный «Умный поиск» портала — лупа в топбаре, не конкурирует.
 */
export function ListToolbar<T>({
  toolbar,
  defs,
  builtinPresets = [],
  left,
  right,
  className,
}: {
  toolbar: ListToolbarState;
  defs: FilterFieldDef<T>[];
  builtinPresets?: FilterPreset[];
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  // Gotcha (docs/gotchas.md «Radix Popover из фокуса»): открывать панель
  // НА onFocus нельзя — focus приходит на mousedown, слой DismissableLayer
  // монтируется между pointerdown и click, и завершающий click той же
  // мыши дисмиссит панель как «взаимодействие снаружи» (вспышка+закрытие).
  // Канон: мышь — открывает onClick (слой монтируется ПОСЛЕ события),
  // клавиатура (Tab/программный focus) — onFocus без указательного флага.
  const fromPointer = useRef(false);
  // Зеркальный симметричный случай: панель уже открыта, повторный клик по
  // якорю — pointerdown-outside дисмиссит её, а запланированный дисмисс
  // добивает ПОСЛЕ нашего onClick (инверсия бэтчинга). Лечение канонично —
  // onInteractOutside + preventDefault для целей внутри якоря (как Radix
  // сам делает для триггера).
  const anchorRef = useRef<HTMLDivElement>(null);
  const activeDefs = defs.filter((d) => isActiveFilter(toolbar.filters[d.id]));

  return (
    <div className={cn('flex h-11 shrink-0 items-center gap-2 px-4', className)}>
      {left}
      <Popover open={panelOpen} onOpenChange={setPanelOpen}>
        <PopoverAnchor asChild>
          {/* Поисковая строка: в фокусе (панель открыта) РАСШИРЯЕТСЯ — как в
              Битриксе, чтобы панель фильтра снизу была достаточно широкой */}
          {/* Поисковая строка: в фокусе (панель открыта) РАСШИРЯЕТСЯ ДО ШИРИНЫ
              панели фильтра — как в Битриксе (поле и окно одной ширины) */}
          <div
            ref={anchorRef}
            className={cn(
              'relative min-w-0 shrink-0 transition-[width] duration-200',
              panelOpen ? 'w-[min(36rem,calc(100vw-3rem))]' : 'w-52',
            )}
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={toolbar.query}
              onChange={(e) => toolbar.setQuery(e.target.value)}
              onPointerDown={() => {
                fromPointer.current = true;
              }}
              onFocus={() => {
                if (!fromPointer.current) setPanelOpen(true);
              }}
              onClick={() => {
                fromPointer.current = false;
                setPanelOpen(true);
              }}
              placeholder={ui.common.searchPlaceholder}
              aria-label={ui.common.search}
              className="h-8 pr-7 pl-8 text-sm"
            />
            {toolbar.query ? (
              <button
                type="button"
                onClick={() => toolbar.setQuery('')}
                aria-label={ui.filters.reset}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-[min(36rem,calc(100vw-2rem))] p-0"
          // Фокус остаётся в поисковой строке: печатать можно сразу (Битрикс).
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Клик по якорю (само поле) — НЕ «взаимодействие снаружи»
          // (защита триггера, как внутри Radix для Trigger).
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <FilterPanel toolbar={toolbar} defs={defs} builtinPresets={builtinPresets} />
        </PopoverContent>
      </Popover>
      {/* Чипы активных фильтров — съёмные (модель Битрикс24) */}
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
        {activeDefs.map((def) => (
          <span
            key={def.id}
            className="flex shrink-0 items-center gap-1 rounded-md border border-port/50 bg-accent/60 px-1.5 py-0.5 text-xs text-foreground"
          >
            <span className="max-w-44 truncate">
              {def.label}: {filterValueLabel(def, toolbar.filters[def.id])}
            </span>
            <button
              type="button"
              onClick={() => toolbar.setFilter(def.id, undefined)}
              aria-label={`${ui.filters.reset}: ${def.label}`}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" strokeWidth={1.75} />
            </button>
          </span>
        ))}
      </div>
      {right ? <div className="ml-auto flex shrink-0 items-center gap-1">{right}</div> : null}
    </div>
  );
}
