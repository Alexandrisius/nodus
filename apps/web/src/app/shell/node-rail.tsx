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
import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { NodeEdge } from '@nodus/ui/components/node-edge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { useHomeSummary } from '../../features/home/api/home-api.js';
import { useShellStore } from './shell-store.js';
import { LogoIcon } from './logo-icon.js';
import { LogoWordmark } from './logo-wordmark.js';

/** Геометрия магистрали: ось шины (и центры портов) в px от левого края рейки. */
const TRUNK_X = 32;
const PORT = 9;

interface MenuItem {
  to: string;
  label: string;
  icon: typeof House;
  exact: boolean;
  badge?: number;
}

/**
 * Левая рейка модулей как магистраль графа (фишка №1 брифа): порты-модули на
 * вертикальной шине от логотипа; навигация — вспышка-пульс от логотипа к порту
 * активного модуля. Координаты портов измеряются из DOM, не константами.
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
  const activeTo = sections.flatMap((s) => s.items).find(isActive)?.to ?? '/';

  // Вспышка: измеряем y порта активного модуля относительно nav и рисуем
  // одноразовое ребро от верха магистрали (логотип) до порта.
  const navRef = useRef<HTMLElement>(null);
  const portRefs = useRef(new Map<string, HTMLSpanElement>());
  const [flashY, setFlashY] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (collapsed) return;
    const nav = navRef.current;
    const port = portRefs.current.get(activeTo);
    if (!nav || !port) return;
    const navBox = nav.getBoundingClientRect();
    const portBox = port.getBoundingClientRect();
    setFlashY(portBox.top - navBox.top + portBox.height / 2);
    const timer = window.setTimeout(() => setFlashY(null), 800);
    return () => window.clearTimeout(timer);
  }, [activeTo, collapsed]);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <LogoIcon className="size-8 shrink-0 text-foreground" />
        {!collapsed && (
          <LogoWordmark className="text-lg tracking-[0.18em] text-foreground uppercase" />
        )}
      </div>

      <nav ref={navRef} className="relative flex flex-1 flex-col gap-4 overflow-y-auto py-3">
        {!collapsed && (
          <span
            aria-hidden
            className="absolute top-0 bottom-3 w-px bg-edge/40"
            style={{ left: TRUNK_X - 0.5 }}
          />
        )}
        {!collapsed && flashY !== null && (
          <NodeEdge
            key={flashY}
            points={[
              { x: TRUNK_X, y: 2 },
              { x: TRUNK_X, y: flashY },
            ]}
            pulse="once"
            drawOn
          />
        )}
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            {!collapsed && (
              <span
                className="pb-1 font-mono text-[11px] font-medium tracking-[0.16em] text-sidebar-foreground/40 uppercase"
                style={{ paddingLeft: TRUNK_X + 20 }}
              >
                {section.title}
              </span>
            )}
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
                  style={collapsed ? undefined : { paddingLeft: TRUNK_X + 20 }}
                >
                  {!collapsed && (
                    <span
                      ref={(el) => {
                        if (el) portRefs.current.set(item.to, el);
                        else portRefs.current.delete(item.to);
                      }}
                      aria-hidden
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 rounded-full border transition-colors',
                        active
                          ? 'border-port bg-port shadow-[0_0_10px_var(--glow)]'
                          : 'border-edge bg-sidebar',
                      )}
                      style={{ left: TRUNK_X - PORT / 2, width: PORT, height: PORT }}
                    />
                  )}
                  <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.badge ? (
                    <span className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground tabular-nums">
                      {item.badge}
                    </span>
                  ) : null}
                  {collapsed && item.badge ? (
                    <span className="absolute top-0.5 right-0.5 rounded border border-border bg-sidebar px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums">
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
          </div>
        ))}
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
