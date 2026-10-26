import { MoreHorizontal, Users } from 'lucide-react';
import { useState } from 'react';
import type { Role } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

import { PersonAvatar } from '../ui/person-avatar.js';
import { LockedBadge } from './access-matrix.js';
import { DeleteRoleDialog, RenameRoleDialog } from './role-dialogs.js';
import { RoleMembersPopover } from './role-members-popover.js';

/**
 * Шапка столбца роли (модель Битрикс24): название, меню «⋯» (переименовать,
 * удалить), аватары участников со счётчиком и «+» — состав роли.
 * «Администратор» — замок, без меню: роль системная и неизменяемая.
 */
export function RoleColumnHeader({
  role,
  canManage,
  lockedHint,
  temporary,
}: {
  role: Role;
  canManage: boolean;
  lockedHint?: string;
  /** Роль создаётся (id ещё временный) — править нельзя. */
  temporary: boolean;
}) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const hasMembers = role.memberCount > 0 || role.departmentCount > 0;
  const deleteBlocked = role.isSystem
    ? ui.access.deleteBlockedSystem
    : hasMembers
      ? ui.access.deleteBlockedMembers
      : null;
  const showMenu = canManage && !lockedHint && !temporary;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <div className="flex w-full min-w-0 items-center justify-center gap-1">
        <span
          className="min-w-0 truncate text-body-xs font-medium"
          title={role.description ?? role.name}
        >
          {role.name}
        </span>
        {lockedHint ? <LockedBadge hint={lockedHint} /> : null}
        {showMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${ui.access.roleMenu}: ${role.name}`}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/30"
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog('rename')}>
                {ui.access.renameRole}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={deleteBlocked !== null}
                onSelect={() => setDialog('delete')}
                className="text-destructive focus:text-destructive"
              >
                {ui.access.deleteRole}
              </DropdownMenuItem>
              {deleteBlocked ? (
                <p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">{deleteBlocked}</p>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {role.preview.length > 0 ? (
                <span className="flex -space-x-1.5">
                  {role.preview.map((user) => (
                    <PersonAvatar
                      key={user.id}
                      name={user.displayName}
                      avatarUrl={user.avatarUrl}
                      className="size-6 ring-2 ring-card"
                    />
                  ))}
                </span>
              ) : (
                <Users className="size-4" strokeWidth={1.75} aria-hidden />
              )}
              <span className="tabular-nums">
                {ui.access.membersCount(role.memberCount, role.departmentCount)}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {ui.access.membersCount(role.memberCount, role.departmentCount)}
          </TooltipContent>
        </Tooltip>
        {temporary ? null : <RoleMembersPopover role={role} canManage={canManage} />}
      </div>

      {dialog === 'rename' ? (
        <RenameRoleDialog role={role} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteRoleDialog role={role} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
