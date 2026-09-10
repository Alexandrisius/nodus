import { Bell, LogOut, Moon, Search, Sun } from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../../shared/auth-store.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { useShellStore } from './shell-store.js';

interface Section {
  label: string;
  to: string;
  search: Record<string, string>;
  isActive: (search: URLSearchParams) => boolean;
}

function sectionsFor(pathname: string): Section[] {
  if (pathname.startsWith('/tasks')) {
    return [
      {
        label: ui.tasks.viewKanban,
        to: '/tasks',
        search: { view: 'kanban' },
        isActive: (s) => (s.get('view') ?? 'kanban') === 'kanban',
      },
      {
        label: ui.tasks.viewList,
        to: '/tasks',
        search: { view: 'list' },
        isActive: (s) => s.get('view') === 'list',
      },
    ];
  }
  if (pathname.startsWith('/letters')) {
    return [
      {
        label: ui.letters.folderIncoming,
        to: '/letters',
        search: { folder: 'incoming' },
        isActive: (s) => (s.get('folder') ?? 'incoming') === 'incoming',
      },
      {
        label: ui.letters.folderUnregistered,
        to: '/letters',
        search: { folder: 'unregistered' },
        isActive: (s) => s.get('folder') === 'unregistered',
      },
      {
        label: ui.letters.folderOutgoing,
        to: '/letters',
        search: { folder: 'outgoing' },
        isActive: (s) => s.get('folder') === 'outgoing',
      },
    ];
  }
  if (pathname.startsWith('/projects')) {
    return [
      {
        label: ui.projects.viewList,
        to: '/projects',
        search: {},
        isActive: () => true,
      },
    ];
  }
  if (pathname.startsWith('/chat')) {
    return [
      {
        label: ui.chat.conversations,
        to: '/chat',
        search: {},
        isActive: () => true,
      },
    ];
  }
  if (pathname.startsWith('/employees')) {
    return [
      {
        label: ui.employees.structure,
        to: '/employees',
        search: {},
        isActive: (s) => (s.get('view') ?? 'org') === 'org',
      },
      {
        label: ui.employees.viewList,
        to: '/employees',
        search: { view: 'list' },
        isActive: (s) => s.get('view') === 'list',
      },
    ];
  }
  return [];
}

/** Топбар «инструмента»: моно-вкладки раздела с портом на оси, поиск Ctrl+K,
 * уведомления, тумблер темы (тёмная/светлая), профиль. */
export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useShellStore((s) => s.theme);
  const toggleTheme = useShellStore((s) => s.toggleTheme);
  const setCommandOpen = useShellStore((s) => s.setCommandOpen);

  const search = new URLSearchParams(searchStr);

  return (
    <header data-topbar className="flex h-14 shrink-0 items-center gap-3 bg-background px-4">
      <nav className="flex h-full min-w-0 flex-1 items-center">
        {sectionsFor(pathname).map((section) => (
          <Link
            key={section.label}
            to={section.to}
            search={section.search}
            data-tab-port
            data-active={section.isActive(search) ? 'true' : undefined}
            className={cn(
              'relative flex h-full items-center px-4 font-mono text-[12px] font-medium tracking-[0.14em] uppercase transition-colors',
              section.isActive(search)
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-9 w-96 max-w-[38vw] shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-input"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{ui.topbar.smartSearch}</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] leading-none">
          {ui.topbar.searchHint}
        </kbd>
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <span className="flex h-9 items-center rounded-md border border-border px-2.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
          RU
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? ui.topbar.themeToLight : ui.topbar.themeToDark}
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span key={theme} className="animate-in fade-in zoom-in-95 duration-300 flex">
            {theme === 'dark' ? <Moon /> : <Sun />}
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui.topbar.notifications}
              className="relative text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Bell />
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>{ui.topbar.notifications}</DropdownMenuLabel>
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {ui.topbar.notificationsEmpty}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={ui.topbar.profile}
              className="-mr-2.5 flex items-center gap-2 rounded-md p-1 hover:bg-accent"
            >
              <PersonAvatar name={user?.displayName ?? ''} className="size-8" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user?.displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void logout()}>
                <LogOut data-icon="inline-start" />
                {ui.topbar.logout}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
