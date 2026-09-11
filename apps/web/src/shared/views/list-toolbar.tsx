import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';

import { FilterPopover } from './filter-popover.js';
import { filterValueLabel, isActiveFilter, type FilterFieldDef } from './list-filters.js';
import type { ListToolbarState } from './use-list-toolbar.js';

/**
 * Строка инструментов списка — ЕДИНЫЙ стандарт всех журналов и вкладок-списков
 * («модули не отличаются», вердикт владельца 2026-09-11): локальный поиск по
 * списку (placeholder всегда называет зону — не путается с глобальным «Умным
 * поиском» портала, который — лупа в топбаре), фильтр по атрибутам с пресетами
 * (модель Битрикс24), чипы активных фильтров, слоты слева (переключатель вида)
 * и справа (шестерёнка отображаемых полей).
 */
export function ListToolbar<T>({
  toolbar,
  defs,
  searchPlaceholder,
  left,
  right,
}: {
  toolbar: ListToolbarState;
  defs: FilterFieldDef<T>[];
  searchPlaceholder: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const activeDefs = defs.filter((d) => isActiveFilter(toolbar.filters[d.id]));

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
      {left}
      <div className="relative w-60 shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={toolbar.query}
          onChange={(e) => toolbar.setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
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
      <FilterPopover toolbar={toolbar} defs={defs} />
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
