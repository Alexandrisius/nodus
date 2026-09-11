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

import { useAuthStore } from '../../shared/auth-store.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';

/**
 * Статичный угол справа-сверху ВНЕ мягкой рамы: аватарка профиля с меню.
 * Угол не движется с мягкой зоной и стоит над полосой коллег — правый край
 * портала становится статичной служебной колонкой (пакет мягкости, вердикт
 * владельца 12.09.2026: «оставить в статичном закоулке — может это и прикольно»).
 */
export function ProfileCorner() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ui.topbar.profile}
          className="flex items-center justify-center rounded-md p-1 hover:bg-accent"
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
  );
}
