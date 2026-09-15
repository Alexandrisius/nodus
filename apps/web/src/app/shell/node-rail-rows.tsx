import { useSortable } from '@dnd-kit/sortable';
import { ChevronDown } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';
import { cn } from '@nodus/ui/lib/utils';

import type { NavModuleDef } from './nav-registry.js';

/** Центр порта модуля (конец отвода). */
const PORT_X = 42;
/** Диаметр порта 7px (вердикт владельца 15.09.2026: 9px — «толстоваты»). */
export const PORT = 7;
/** Геометрия рядов: h-10 + gap-0.5 → шаг 42, центр первого ряда 20.
 *  (Ось контента ряда — 60px от левого края: плашка с 52px + иконка 8px.) */
export const ROW_STRIDE = 42;
export const ROW_CENTER = 20;

/** Маркер сепаратора «Скрытое» в черновике порядка (не id модуля). */
export const HIDDEN_SENTINEL = '__hidden__';

const monoLabel =
  'font-mono text-[11px] tracking-[0.14em] text-sidebar-foreground/50 uppercase hover:text-sidebar-foreground';

/** Ряды левой рейки (вынесены из node-rail, I5): ссылка модуля, порт,
 *  сортируемый ряд режима настройки, сепаратор «Скрытое», кнопка
 *  «Показать всё ▾». */

/** Обычный ряд-ссылка модуля (развёрнутая/схлопнутая рейка, тултип). */
export function RailRowLink({
  module: m,
  collapsed,
  active,
  badge,
}: {
  module: NavModuleDef;
  collapsed: boolean;
  active: boolean;
  badge?: number;
}) {
  const link = (
    <Link
      to={m.to}
      className={cn(
        'relative flex h-10 items-center overflow-hidden rounded-md text-sm font-medium',
        'transition-[color,gap,padding,background-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
        collapsed ? 'mx-3' : 'mr-3 ml-[52px]',
        collapsed ? 'gap-0' : 'gap-3',
      )}
      style={{ paddingLeft: collapsed ? 11 : 8 }}
    >
      <m.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
      <span
        className={cn(
          'truncate transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'max-w-0 opacity-0' : 'max-w-40 opacity-100',
        )}
      >
        {m.label}
      </span>
      <span
        className={cn(
          'ml-auto pr-2.5 font-mono text-[11px] text-muted-foreground/80 tabular-nums',
          'transition-[max-width,opacity,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'max-w-0 pr-0 opacity-0' : 'max-w-12 opacity-100',
        )}
      >
        {badge ?? ''}
      </span>
      {badge ? (
        <span
          className={cn(
            'absolute top-0.5 right-0.5 rounded bg-secondary px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums',
            'transition-opacity duration-300',
            collapsed ? 'opacity-100' : 'opacity-0',
          )}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{m.label}</TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

/** Порт модуля по индексу ряда (декоративный, замеряется контуром). */
export function RailPort({
  module: m,
  index,
  active,
}: {
  module: NavModuleDef;
  index: number;
  active: boolean;
}) {
  return (
    <span
      data-module-port={m.to}
      data-active={active ? 'true' : undefined}
      aria-hidden
      className={cn(
        'pointer-events-none absolute rounded-full border transition-colors',
        active ? 'border-port bg-port shadow-[0_0_10px_var(--glow)]' : 'border-edge bg-transparent',
      )}
      style={{
        left: PORT_X - PORT / 2,
        top: ROW_CENTER + index * ROW_STRIDE - PORT / 2,
        width: PORT,
        height: PORT,
      }}
    />
  );
}

/** Ряд рейки в режиме настройки: весь ряд — ручка (движение только по Y). */
export function SortableRailRow({
  module: m,
  badge,
  dimmed,
}: {
  module: NavModuleDef;
  badge?: number;
  dimmed: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${m.label} — ${ui.nav.dragToReorder}`}
      className={cn(
        'relative mr-3 ml-[52px] flex h-10 cursor-grab items-center gap-3 overflow-hidden rounded-md pl-2 text-sm font-medium select-none',
        dimmed
          ? 'text-sidebar-foreground/40'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70',
        isDragging && 'z-10 cursor-grabbing bg-sidebar-accent shadow-md',
      )}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      <m.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
      <span className="max-w-40 truncate">{m.label}</span>
      <span className="ml-auto pr-2.5 font-mono text-[11px] text-muted-foreground/80 tabular-nums">
        {badge ?? ''}
      </span>
    </div>
  );
}

/** Сепаратор «— Скрытое —» в ряду настройки: слот есть, не таскается
 *  (модули переносятся ЧЕРЕЗ него — за сепаратором = скрытые). */
export function HiddenSentinelRow() {
  const { setNodeRef } = useSortable({ id: HIDDEN_SENTINEL, disabled: true });
  return (
    <div ref={setNodeRef} className="mx-3 flex h-10 items-center gap-2 select-none" aria-hidden>
      <span className="h-px flex-1 bg-sidebar-foreground/15" />
      <span className="font-mono text-[10px] tracking-[0.14em] text-sidebar-foreground/40 uppercase">
        {ui.nav.hiddenSection}
      </span>
      <span className="h-px flex-1 bg-sidebar-foreground/15" />
    </div>
  );
}

/** Сепаратор «— Скрытое —» в обычном режиме (между видимыми и скрытыми). */
export function HiddenDividerRow() {
  return (
    <div className="mx-3 my-1 flex items-center gap-2" aria-hidden>
      <span className="h-px flex-1 bg-sidebar-foreground/15" />
      <span className="font-mono text-[10px] tracking-[0.14em] text-sidebar-foreground/40 uppercase">
        {ui.nav.hiddenSection}
      </span>
      <span className="h-px flex-1 bg-sidebar-foreground/15" />
    </div>
  );
}

/** Кнопка «Показать всё ▾» / сворачивание скрытых (модель Битрикс24). */
export function ShowHiddenToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn('mr-3 ml-[52px] flex h-8 items-center gap-2 rounded-md pl-2', monoLabel)}
    >
      <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
      {ui.common.showAll}
    </button>
  );
}
