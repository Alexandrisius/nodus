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
import { cn } from '@nodus/ui/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { useHomeSummary } from '../../features/home/api/home-api.js';
import { useShellStore } from './shell-store.js';
import { LogoIcon } from './logo-icon.js';
import { LogoWordmark } from './logo-wordmark.js';

interface MenuItem {
  to: string;
  label: string;
  icon: typeof House;
  exact: boolean;
  badge?: number;
}

/** Левое меню модулей: по умолчанию узкая иконочная рейка, раскрывается до 240px. */
export function SideMenu() {
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

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-20' : 'w-60',
      )}
    >
      <div
        className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}
      >
        <LogoIcon className="size-8 shrink-0 text-ochre" />
        {!collapsed && <LogoWordmark className="text-lg tracking-[0.18em] text-cream uppercase" />}
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            {!collapsed && (
              <span className="px-1 pb-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                {section.title}
              </span>
            )}
            {section.items.map((item) => {
              const active = item.exact ? pathname === '/' : pathname.startsWith(item.to);
              const link = (
                <Link
                  to={item.to}
                  className={cn(
                    'relative flex h-11 w-full items-center gap-3 rounded-lg px-2 text-sm font-medium transition-colors',
                    'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <item.icon className="size-5 shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {item.badge ? (
                    <span
                      className={cn(
                        'rounded-full bg-rust px-1.5 py-0.5 text-[11px] font-semibold text-cream tabular-nums',
                        collapsed ? 'absolute top-1 right-2.5' : 'ml-auto',
                      )}
                    >
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

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.nav.expand : ui.nav.collapse}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
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
