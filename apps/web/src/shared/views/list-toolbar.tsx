import { Search, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
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
          {/* Поисковая строка — композитный контрол (модель Битрикс24):
              применённые фильтры — ЧИПАМИ ВНУТРИ поля слева, текст запроса —
              после них; в фокусе (панель открыта) поле РАСШИРЯЕТСЯ ДО ШИРИНЫ
              панели фильтра */}
          <div
            ref={anchorRef}
            className={cn(
              'relative min-w-0 shrink-0 transition-[width] duration-200',
              panelOpen ? 'w-[min(36rem,calc(100vw-3rem))]' : 'w-[28rem]',
            )}
          >
            <div
              className={cn(
                'flex h-8 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent pr-1 pl-2 transition-colors dark:bg-input/30',
                'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30',
              )}
            >
              <Search className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
              {/* Чипы активных фильтров — ВНУТРИ поля (модель Битрикс24);
                  суммарно ≤ 80% ширины поля (вердикт владельца), значение —
                  с truncate, остальное место — тексту запроса */}
              <div className="flex max-w-[80%] shrink-0 items-center gap-1 overflow-hidden">
                {activeDefs.map((def) => (
                  <span
                    key={def.id}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs whitespace-nowrap text-foreground"
                  >
                    <span
                      className="max-w-40 truncate"
                      title={`${def.label}: ${filterValueLabel(def, toolbar.filters[def.id])}`}
                    >
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
              <input
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
                className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              {toolbar.query ? (
                <button
                  type="button"
                  onClick={() => toolbar.setQuery('')}
                  aria-label={ui.filters.reset}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
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
      {right ? <div className="ml-auto flex shrink-0 items-center gap-1">{right}</div> : null}
    </div>
  );
}
