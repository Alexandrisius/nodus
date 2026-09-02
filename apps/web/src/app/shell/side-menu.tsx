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
  tint: string;
  badge?: number;
}

/** Левое меню модулей 240px (каркас §10.2): стекло поверх заставки, секции, цветные чипы. */
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
        {
          to: '/',
          label: ui.nav.home,
          icon: House,
          exact: true,
          tint: 'bg-sky-400/15 text-sky-300',
        },
        {
          to: '/tasks',
          label: ui.nav.tasks,
          icon: ListTodo,
          exact: false,
          tint: 'bg-indigo-400/15 text-indigo-300',
          badge: tasksBadge,
        },
        {
          to: '/letters',
          label: ui.nav.letters,
          icon: Mail,
          exact: false,
          tint: 'bg-amber-400/15 text-amber-300',
          badge: lettersBadge,
        },
        {
          to: '/projects',
          label: ui.nav.projects,
          icon: FolderOpen,
          exact: false,
          tint: 'bg-emerald-400/15 text-emerald-300',
        },
      ],
    },
    {
      title: ui.nav.sectionComm,
      items: [
        {
          to: '/chat',
          label: ui.nav.chat,
          icon: MessageSquare,
          exact: false,
          tint: 'bg-pink-400/15 text-pink-300',
          badge: chatBadge,
        },
        {
          to: '/employees',
          label: ui.nav.employees,
          icon: Users,
          exact: false,
          tint: 'bg-teal-400/15 text-teal-300',
        },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-white/10 bg-[#0B1524]/70 text-white backdrop-blur-xl transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}
      >
        <LogoIcon className="size-8 shrink-0 text-sky-300" />
        {!collapsed && <LogoWordmark className="text-lg text-white" />}
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 pt-2">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            {!collapsed && (
              <span className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-white/40 uppercase">
                {section.title}
              </span>
            )}
            {section.items.map((item) => {
              const active = item.exact ? pathname === '/' : pathname.startsWith(item.to);
              const link = (
                <Link
                  to={item.to}
                  className={cn(
                    'flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors',
                    'text-white/75 hover:bg-white/10 hover:text-white',
                    active && 'bg-white/10 text-white shadow-[inset_2px_0_0_#38bdf8]',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg',
                      item.tint,
                      active && 'ring-1 ring-white/25',
                    )}
                  >
                    <item.icon className="size-4.5" />
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                          {item.badge}
                        </span>
                      ) : null}
                    </>
                  )}
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

      <div className="px-2.5 pb-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.nav.expand : ui.nav.collapse}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-white/50 hover:bg-white/10 hover:text-white',
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
