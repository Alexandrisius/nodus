import { Bell, Check, LogOut, Palette, Plus, Search } from 'lucide-react';
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
import { useShellStore, type ThemeId } from './shell-store.js';

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
  return [];
}

const themes: { id: ThemeId; label: string }[] = [
  { id: 'nodus', label: ui.topbar.themeNodus },
  { id: 'ink', label: ui.topbar.themeInk },
  { id: 'paper', label: ui.topbar.themePaper },
];

/** Топбар «инструмента»: моно-вкладки раздела с портом на оси, поиск Ctrl+K,
 * уведомления, «Создать», профиль. Селектор легаси-тем — только в dev. */
export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useShellStore((s) => s.theme);
  const setTheme = useShellStore((s) => s.setTheme);
  const setCommandOpen = useShellStore((s) => s.setCommandOpen);

  const search = new URLSearchParams(searchStr);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <nav className="flex h-full min-w-0 flex-1 items-center">
        {sectionsFor(pathname).map((section) => (
          <Link
            key={section.label}
            to={section.to}
            search={section.search}
            className={cn(
              'relative flex h-full items-center px-4 font-mono text-[12px] font-medium tracking-[0.14em] uppercase transition-colors',
              section.isActive(search)
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
          >
            {section.label}
            {section.isActive(search) && (
              <span
                data-tab-port
                aria-hidden
                className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-port shadow-[0_0_8px_var(--glow)]"
              />
            )}
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

        {import.meta.env.DEV ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={ui.topbar.theme}
                className="relative text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Palette />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{ui.topbar.theme}</DropdownMenuLabel>
              <DropdownMenuGroup>
                {themes.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)}>
                    {theme === t.id && <Check data-icon="inline-start" />}
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

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

        <Button className="gap-1.5">
          <Plus data-icon="inline-start" />
          {ui.topbar.create}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={ui.topbar.profile}
              className="flex items-center gap-2 rounded-md p-1 hover:bg-accent"
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
