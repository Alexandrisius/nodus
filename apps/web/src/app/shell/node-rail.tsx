import { useEffect, useState } from 'react';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  ArrowUpDown,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Settings2,
  Users,
} from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { Permission, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Checkbox } from '@nodus/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { useHomeSummary } from '../../features/home/api/home-api.js';
import { useAuthStore } from '../../shared/auth-store.js';
import { CIRCUIT_REMEASURE } from './circuit-geometry.js';
import { NAV_MODULES, type NavModuleDef } from './nav-registry.js';
import {
  HIDDEN_SENTINEL,
  HiddenDividerRow,
  HiddenSentinelRow,
  PORT,
  RailPort,
  RailRowLink,
  ShowHiddenToggle,
  SortableRailRow,
} from './node-rail-rows.js';
import { resolveHidden, resolveOrder } from './ui-prefs.js';
import { useUiPrefsStore } from './ui-prefs-store.js';
import { useShellStore } from './shell-store.js';
import { LogoIcon } from './logo-icon.js';
import { LogoWordmark } from './logo-wordmark.js';

/** Ось шины в px от левого края рейки (импортируется circuit-geometry). */
export const RAIL_TRUNK_X = 24;
/** Радиус порта — конец отвода магистрали прячется ПОД кромку круга. */
export const MODULE_PORT_R = PORT / 2;

/**
 * Левая рейка модулей как магистраль графа (реф node-based UI): хребет
 * со скруглёнными отводами к портам; активные отвод и порт светятся.
 *
 * ПЕРСОНАЛЬНЫЙ ПОРЯДОК (концепт #4, вердикты владельца 15.09.2026): секций
 * «Работа»/«Общение» нет — плоский список личный ?? общий ?? системный.
 * Модуль «НАСТРОЙКИ» прибит ВНИЗУ рейки (модель Битрикс24) — контекстное
 * меню: «Изменить порядок» (режим dnd с НЕПОДВИЖНЫМ сепаратором «— Скрытое
 * —»: перетащил модуль за сепаратор = скрыл; минимум один видимый),
 * «Применить порядок для всех» (Permission.SETTINGS_UI_DEFAULTS — текущий
 * порядок становится общим), «Вернуть по умолчанию». Скрытые модули в
 * обычном режиме — под «Показать всё ▾» внизу списка; раскрытие живёт до
 * любого действия (навигация сворачивает). Первый ВИДИМЫЙ модуль —
 * стартовый экран приложения (переадресация «/», router.tsx).
 */
export function NodeRail() {
  const collapsed = useShellStore((s) => s.menuCollapsed);
  const toggle = useShellStore((s) => s.toggleMenu);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: home } = useHomeSummary();
  const { data: chats } = useConversations();

  const personal = useUiPrefsStore((s) => s.personal);
  const company = useUiPrefsStore((s) => s.company);
  const applyNav = useUiPrefsStore((s) => s.applyNav);
  const resetPersonal = useUiPrefsStore((s) => s.resetPersonal);
  const canForAll = useAuthStore(
    (s) => s.user?.permissions.includes(Permission.SETTINGS_UI_DEFAULTS) ?? false,
  );

  const ids = NAV_MODULES.map((m) => m.id);
  const order = resolveOrder(ids, personal.navOrder, company.navOrder);
  const hidden = resolveHidden(ids, personal.navHidden, company.navHidden);
  const byId = (id: string) => NAV_MODULES.find((m) => m.id === id);
  const defined = (m: NavModuleDef | undefined): m is NavModuleDef => m !== undefined;
  const visibleModules = order
    .filter((id) => !hidden.includes(id))
    .map(byId)
    .filter(defined);
  const hiddenModules = order
    .filter((id) => hidden.includes(id))
    .map(byId)
    .filter(defined);

  // Режим настройки: черновик [видимые…, СЕПАРАТОР, скрытые…] + скоуп.
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [forAll, setForAll] = useState(false);
  // «Показать всё ▾» — раскрытые скрытые модули в обычном режиме; после
  // любого действия (навигация) сворачивается обратно (модель Битрикс24).
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => setShowHidden(false), [pathname]);

  const sensors = useSensors(useSensor(PointerSensor));

  const badges = (m: NavModuleDef): number | undefined => {
    if (m.badge === 'tasks') {
      const n = home
        ? home.tasks.overdue.length + home.tasks.today.length + home.tasks.weekCount
        : 0;
      return n || undefined;
    }
    if (m.badge === 'letters') return home?.letters.unregisteredCount || undefined;
    if (m.badge === 'chat') {
      const n = (chats?.items ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
      return n || undefined;
    }
    return undefined;
  };

  const isActive = (m: NavModuleDef) => (m.exact ? pathname === m.to : pathname.startsWith(m.to));
  const remeasure = () => window.dispatchEvent(new Event(CIRCUIT_REMEASURE));

  const startCustomize = () => {
    if (collapsed) toggle();
    setDraft([
      ...visibleModules.map((m) => m.id),
      HIDDEN_SENTINEL,
      ...hiddenModules.map((m) => m.id),
    ]);
    setForAll(false);
    setCustomizing(true);
    remeasure();
  };
  const applyCustomize = () => {
    const sentIdx = draft.indexOf(HIDDEN_SENTINEL);
    applyNav(
      draft.filter((id) => id !== HIDDEN_SENTINEL),
      draft.slice(sentIdx + 1),
      forAll,
    );
    setCustomizing(false);
    remeasure();
  };
  // Отмена: порядок откатывается вместе с КОНТУРОМ — без перемера линия
  // оставалась от черновика (баг-вердикт 15.09.2026: «модуль вернулся,
  // связь изменилась»); rAF-перемер читает DOM уже после коммита React.
  const cancelCustomize = () => {
    setCustomizing(false);
    remeasure();
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.indexOf(String(active.id));
      const to = d.indexOf(String(over.id));
      if (from < 0 || to < 0 || from === to) return d;
      const next = arrayMove(d, from, to);
      // Минимум один видимый модуль: сепаратор первым стать не может.
      if (next.indexOf(HIDDEN_SENTINEL) === 0) return d;
      return next;
    });
    // Порты следуют за слотами сразу; вспышки нет — фокус не меняется.
    remeasure();
  };

  return (
    <aside
      data-rail
      className={cn(
        'relative flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground',
        'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        collapsed && !customizing ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center justify-center px-4',
          'transition-[gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed && !customizing ? 'gap-0 px-0' : 'gap-2.5',
        )}
      >
        <span data-logo-port className="flex shrink-0">
          <LogoIcon className="size-9 text-foreground" />
        </span>
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            collapsed && !customizing ? 'max-w-0 opacity-0' : 'max-w-44 opacity-100',
          )}
        >
          <LogoWordmark className="text-xl tracking-[0.18em] text-foreground uppercase" />
        </span>
      </div>

      {/* Якорь узла бокового шва схлопнутой рейки (канон — в git-истории). */}
      {collapsed && !customizing && (
        <span data-left-node aria-hidden className="absolute top-[63px] -right-[8.5px] size-px" />
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-3">
        {customizing ? (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragOver={onDragOver}
            >
              <SortableContext items={draft} strategy={verticalListSortingStrategy}>
                <div className="relative flex flex-col gap-0.5">
                  {draft.map((id) => {
                    if (id === HIDDEN_SENTINEL) return <HiddenSentinelRow key={id} />;
                    const m = byId(id);
                    if (!m) return null;
                    return (
                      <SortableRailRow
                        key={id}
                        module={m}
                        badge={badges(m)}
                        dimmed={draft.indexOf(id) > draft.indexOf(HIDDEN_SENTINEL)}
                      />
                    );
                  })}
                  {/* Порты следуют черновику (слот сепаратора учтён в индексах). */}
                  {draft
                    .filter((id) => id !== HIDDEN_SENTINEL)
                    .map((id) => {
                      const m = byId(id);
                      if (!m) return null;
                      return (
                        <RailPort
                          key={id}
                          module={m}
                          index={draft.indexOf(id)}
                          active={isActive(m)}
                        />
                      );
                    })}
                </div>
              </SortableContext>
            </DndContext>
            {/* Подтверждение — НА МЕСТЕ ряда «Настройки», сразу после списка
                (вердикт 15.09.2026: не в подвале рейки — команда и её
                подтверждение держатся вместе даже при коротком списке). */}
            <div className="mx-3 mt-2 flex flex-col gap-2 border-t border-sidebar-foreground/10 pt-2">
              {canForAll ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-sidebar-foreground/70">
                  <Checkbox checked={forAll} onCheckedChange={(v) => setForAll(v === true)} />
                  {ui.nav.customizeForAll}
                </label>
              ) : null}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={applyCustomize}>
                  {ui.nav.customizeDone}
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={cancelCustomize}>
                  {ui.common.cancel}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="relative flex flex-col gap-0.5">
            {visibleModules.map((m) => (
              <RailRowLink
                key={m.id}
                module={m}
                collapsed={collapsed}
                active={isActive(m)}
                badge={badges(m)}
              />
            ))}
            {!collapsed &&
              visibleModules.map((m, i) => (
                <RailPort key={m.id} module={m} index={i} active={isActive(m)} />
              ))}
            {/* Скрытые модули: «Показать всё ▾» → сепаратор «— Скрытое —» +
                ссылки (без портов — временный просмотр, Битрикс24). */}
            {hiddenModules.length > 0 && !collapsed ? (
              <>
                <ShowHiddenToggle expanded={showHidden} onToggle={() => setShowHidden((v) => !v)} />
                {showHidden ? (
                  <>
                    <HiddenDividerRow />
                    {hiddenModules.map((m) => (
                      <RailRowLink
                        key={m.id}
                        module={m}
                        collapsed={collapsed}
                        active={isActive(m)}
                        badge={badges(m)}
                      />
                    ))}
                  </>
                ) : null}
              </>
            ) : null}

            {/* «Настройки» — ТЕХНИЧЕСКАЯ команда сразу после списка (вердикт
                владельца 15.09.2026, модель Битрикс24): не участвует в
                порядке, отступ сверху больше обычного (mt-2) — читается как
                команда, не модуль; меню — НАД кнопкой у её левого края. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={ui.nav.settings}
                  className={cn(
                    'relative mt-2 flex h-10 shrink-0 items-center overflow-hidden rounded-md text-sm font-medium',
                    'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
                    collapsed ? 'mx-3 justify-center' : 'mr-3 ml-[52px] gap-3 pl-2',
                  )}
                >
                  <Settings2 className="size-[18px] shrink-0" strokeWidth={1.75} />
                  {collapsed ? null : ui.nav.settings}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="start" className="w-64">
                <DropdownMenuItem onSelect={startCustomize}>
                  <ArrowUpDown className="size-4" />
                  {ui.nav.editOrder}
                </DropdownMenuItem>
                {canForAll ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      applyNav(order, hidden, true);
                      remeasure();
                    }}
                  >
                    <Users className="size-4" />
                    {ui.nav.applyForAll}
                  </DropdownMenuItem>
                ) : null}
                {personal.navOrder !== undefined || personal.navHidden !== undefined ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      resetPersonal();
                      remeasure();
                    }}
                  >
                    <RotateCcw className="size-4" />
                    {ui.nav.resetDefault}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </nav>

      {/* Подвал — только сворачивание рейки (подтверждение режима настройки
          живёт инлайн после списка, на месте ряда «Настройки»). */}
      <div className="flex shrink-0 p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.nav.expand : ui.nav.collapse}
          className="flex h-8 flex-1 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
