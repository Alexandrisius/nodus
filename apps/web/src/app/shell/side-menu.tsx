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

import { useShellStore } from './shell-store.js';
import { LogoIcon } from './logo-icon.js';
import { LogoWordmark } from './logo-wordmark.js';

const items = [
  { to: '/', label: ui.nav.home, icon: House, exact: true },
  { to: '/tasks', label: ui.nav.tasks, icon: ListTodo, exact: false },
  { to: '/letters', label: ui.nav.letters, icon: Mail, exact: false },
  { to: '/projects', label: ui.nav.projects, icon: FolderOpen, exact: false },
  { to: '/chat', label: ui.nav.chat, icon: MessageSquare, exact: false },
  { to: '/employees', label: ui.nav.employees, icon: Users, exact: false },
];

/** Левое меню модулей 240px (каркас §10.2), сворачиваемое до полосы иконок. */
export function SideMenu() {
  const collapsed = useShellStore((s) => s.menuCollapsed);
  const toggle = useShellStore((s) => s.toggleMenu);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}
      >
        <LogoIcon className="size-8 shrink-0 text-sidebar-primary" />
        {!collapsed && <LogoWordmark className="text-lg text-sidebar-foreground" />}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2.5 pt-2">
        {items.map((item) => {
          const active = item.exact ? pathname === '/' : pathname.startsWith(item.to);
          const link = (
            <Link
              to={item.to}
              className={cn(
                'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
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
      </nav>

      <div className="px-2.5 pb-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.nav.expand : ui.nav.collapse}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
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
