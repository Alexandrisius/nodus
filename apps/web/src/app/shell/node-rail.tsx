import {
  FolderOpen,
  House,
  ListTodo,
  Mail,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { useHomeSummary } from '../../features/home/api/home-api.js';
import { useShellStore } from './shell-store.js';
import { LogoIcon } from './logo-icon.js';
import { LogoWordmark } from './logo-wordmark.js';

/** Ось шины в px от левого края рейки (импортируется circuit-geometry). */
export const RAIL_TRUNK_X = 24;
/** Центр порта модуля (конец отвода). */
const PORT_X = 42;
const PORT = 9;
/** Отступ контента ряда от порта. */
const CONTENT_X = 60;
/** Геометрия рядов: h-10 + gap-0.5 → шаг 42, центр первого ряда 20. */
const ROW_STRIDE = 42;
const ROW_CENTER = 20;

interface MenuItem {
  to: string;
  label: string;
  icon: typeof House;
  exact: boolean;
  badge?: number;
}

/**
 * Левая рейка модулей как магистраль графа (реф node-based UI): хребет секции
 * со скруглёнными отводами к портам модулей; активные отвод и порт светятся.
 * Навигационная вспышка — NavigationFlash: измеряет порты по data-атрибутам.
 */
export function NodeRail() {
  const collapsed = useShellStore((s) => s.menuCollapsed);
  const toggle = useShellStore((s) => s.toggleMenu);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: home } = useHomeSummary();
  const { data: chats } = useConversations();

  const tasksBadge = home
    ? home.tasks.overdue.length + home.tasks.today.length + home.tasks.weekCount
    : 0;
  const lettersBadge = home?.letters.unregisteredCount ?? 0;
  const chatBadge = (chats?.items ?? []).reduce((sum, c) => sum + c.unreadCount, 0);

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: ui.nav.sectionWork,
      items: [
        { to: '/', label: ui.nav.home, icon: House, exact: true },
        { to: '/tasks', label: ui.nav.tasks, icon: ListTodo, exact: false, badge: tasksBadge },
        { to: '/letters', label: ui.nav.letters, icon: Mail, exact: false, badge: lettersBadge },
        { to: '/projects', label: ui.nav.projects, icon: FolderOpen, exact: false },
      ],
    },
    {
      title: ui.nav.sectionComm,
      items: [
        { to: '/chat', label: ui.nav.chat, icon: MessageSquare, exact: false, badge: chatBadge },
        { to: '/employees', label: ui.nav.employees, icon: Users, exact: false },
      ],
    },
  ];

  const isActive = (item: MenuItem) =>
    item.exact ? pathname === '/' : pathname.startsWith(item.to);

  return (
    <aside
      data-rail
      className={cn(
        'relative flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <span data-logo-port className="flex shrink-0">
          <LogoIcon className="size-8 text-foreground" />
        </span>
        {!collapsed && (
          <LogoWordmark className="text-lg tracking-[0.18em] text-foreground uppercase" />
        )}
      </div>

      {/* Узел контура на боковом шве схлопнутой рейки — как на правой панели. */}
      {collapsed && (
        <>
          <span data-left-node aria-hidden className="absolute top-[55px] right-0 size-px" />
          <span
            aria-hidden
            className="absolute top-[51.5px] -right-[4.5px] z-10 size-[9px] rounded-full border border-edge bg-sidebar"
          />
        </>
      )}

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto py-3">
        {sections.map((section) => {
          return (
            <div key={section.title} className="flex flex-col gap-0.5">
              {!collapsed && (
                <span
                  className="pb-1 font-mono text-[11px] font-medium tracking-[0.16em] text-sidebar-foreground/40 uppercase"
                  style={{ paddingLeft: CONTENT_X }}
                >
                  {section.title}
                </span>
              )}
              <div className="relative flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(item);
                  const link = (
                    <Link
                      to={item.to}
                      className={cn(
                        'relative flex h-10 items-center gap-3 rounded-md text-sm font-medium transition-colors',
                        'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
                        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                        collapsed ? 'mx-3 justify-center' : 'mr-3',
                      )}
                      style={collapsed ? undefined : { paddingLeft: CONTENT_X }}
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge ? (
                        <span className="ml-auto pr-1 font-mono text-[11px] text-muted-foreground/80 tabular-nums">
                          {item.badge}
                        </span>
                      ) : null}
                      {collapsed && item.badge ? (
                        <span className="absolute top-0.5 right-0.5 rounded bg-secondary px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                  return collapsed ? (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span key={item.to}>{link}</span>
                  );
                })}
                {/* Порты модулей — только в развёрнутой рейке (в схлопнутой
                    контур опирается на узел бокового шва, как на правой панели). */}
                {!collapsed &&
                  section.items.map((item, i) => {
                    const active = isActive(item);
                    return (
                      <span
                        key={item.to}
                        data-module-port={item.to}
                        data-active={active ? 'true' : undefined}
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute rounded-full border transition-colors',
                          active
                            ? 'border-port bg-port shadow-[0_0_10px_var(--glow)]'
                            : 'border-edge bg-transparent',
                        )}
                        style={{
                          left: PORT_X - PORT / 2,
                          top: ROW_CENTER + i * ROW_STRIDE - PORT / 2,
                          width: PORT,
                          height: PORT,
                        }}
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.nav.expand : ui.nav.collapse}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          {!collapsed && ui.nav.collapse}
        </button>
      </div>
    </aside>
  );
}
