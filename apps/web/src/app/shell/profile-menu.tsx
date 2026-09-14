import { LogOut } from 'lucide-react';
import { ui } from '@nodus/contracts';
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

/**
 * Аватарка профиля с меню — ВЕРХ правой служебной полосы (за пределами
 * мягкой рамы, план R3/R4): тот же кегль, что аватарки коллег (size-7), и та
 * же ось центровки — профиль стоит ТОЧНО над списком коллег. От коллег
 * аватарку отличает ТОНКИЙ ЦВЕТНОЙ ОБОДОК ring-1 primary/60 (R6): плашка-
 * обруч читалась «толстой и невычурно-огромной» (вердикт 14.09.2026) —
 * ободок лишь подсвечивает. В раскрытой полосе рядом появляется подпись
 * «Мой профиль» (R4); подпись гаснет/проявляется кросс-фейдом max-width,
 * как строки рейки, — рефлоу ширины без рывков.
 */
export function ProfileMenu({ expanded }: { expanded: boolean }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ui.topbar.profile}
          className="flex w-full shrink-0 items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-accent"
        >
          <PersonAvatar
            name={user?.displayName ?? ''}
            className="size-7 shrink-0 ring-1 ring-primary/60"
          />
          <span
            className={cn(
              'overflow-hidden truncate whitespace-nowrap text-[13px] text-foreground',
              'transition-[max-width,opacity] duration-200 ease-out',
              expanded ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0',
            )}
          >
            {ui.topbar.myProfile}
          </span>
        </button>
      </DropdownMenuTrigger>
      {/* Меню — влево от полосы: справа у него край вьюпорта. Порталы
          оверлеев — z-[70] выше полосы (R7, лестница z). */}
      <DropdownMenuContent side="left" align="start">
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
  );
}
