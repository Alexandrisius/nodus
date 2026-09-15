import { Bell, Moon, Search, Sun } from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { HomeGreeting } from '../../features/home/components/home-greeting.js';
import { navModuleForPath } from './nav-registry.js';
import { ProfileMenu } from './profile-menu.js';
import { useShellStore } from './shell-store.js';

/**
 * Топбар «инструмента»: моно-вкладки раздела с портом на оси ИЗ ЕДИНОГО
 * реестра (nav-registry), ФИКСИРОВАННЫЕ (вердикт владельца 15.09.2026:
 * верхние вкладки без кастомизации — персональный порядок и «Скрытое»
 * живут только в левой рейке); правой группой — глобальный «Умный поиск»
 * ЛУПОЙ (модель позднего Битрикс24: не конкурирует с локальным поиском
 * списков за глаза; Ctrl+K работает), уведомления, тумблер темы. Профиль —
 * ВЕРХ служебной полосы за пределами мягкой рамы (ProfileMenu, план R3/R4).
 */
export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const theme = useShellStore((s) => s.theme);
  const toggleTheme = useShellStore((s) => s.toggleTheme);
  const setCommandOpen = useShellStore((s) => s.setCommandOpen);

  const search = new URLSearchParams(searchStr);
  const module = navModuleForPath(pathname);

  // Фон НЕ красим: топбар живёт ВНУТРИ мягкой рамы и наследует её «лист» —
  // собственная заливка bg-background прятала верхнюю ступень рамы
  // (вердикт владельца 12.09.2026: «верх мягкой карточки не виден из-за
  // чёрного хэдера»).
  return (
    <header data-topbar className="flex h-14 shrink-0 items-center gap-3 px-4">
      <nav className="flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden">
        {/* Главная без вкладок: пустую полосу занимает приветствие — лента
            начинается выше (вердикт владельца 12.09.2026). */}
        {!module || module.tabs.length === 0 ? (
          <HomeGreeting />
        ) : (
          module.tabs.map((tab) => (
            <Link
              key={tab.id}
              to={module.to}
              search={tab.search}
              data-tab-port
              data-active={tab.isActive(search) ? 'true' : undefined}
              className={cn(
                'relative flex h-full items-center px-4 font-mono text-[12px] font-medium tracking-[0.14em] uppercase transition-colors',
                tab.isActive(search)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              {tab.label}
            </Link>
          ))
        )}
      </nav>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        {/* Глобальный «Умный поиск» — лупа (та же палитра Ctrl+K); большого
            поля в центре нет — не путается с локальным поиском списков */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandOpen(true)}
          aria-label={`${ui.topbar.smartSearch} (${ui.topbar.searchHint})`}
          title={`${ui.topbar.smartSearch} (${ui.topbar.searchHint})`}
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Search />
        </Button>

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
          <span key={theme} className="flex animate-in duration-300 fade-in zoom-in-95">
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
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary ring-2 ring-background" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>{ui.topbar.notifications}</DropdownMenuLabel>
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {ui.topbar.notificationsEmpty}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Профиль — правый верх мягкой рамы, справа от уведомлений (вердикт
            владельца 15.09.2026: служебная полоса — только аватарки коллег). */}
        <ProfileMenu />
      </div>
    </header>
  );
}
