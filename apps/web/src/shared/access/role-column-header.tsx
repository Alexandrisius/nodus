import { Check, Copy, Lock, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Role } from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

import { useCreateRole, useUpdateRole } from '../api/role-admin.js';
import { useAuthStore } from '../auth-store.js';
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
  const showMenu = canManage && !temporary;
  const actorPermissions = useAuthStore((state) => state.user?.permissions);
  const update = useUpdateRole();
  const create = useCreateRole();
  const heldAll = Object.values(Permission).filter((permission) =>
    (actorPermissions ?? []).includes(permission),
  );

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
            <DropdownMenuContent align="end" className="w-72 p-1.5">
              {lockedHint ? null : (
                <>
                  <MenuEntry
                    icon={<Check className="size-4 text-success" strokeWidth={2} />}
                    title={ui.access.openAll}
                    hint={ui.access.openAllHint}
                    onSelect={() => update.mutate({ id: role.id, body: { permissions: heldAll } })}
                  />
                  <MenuEntry
                    icon={<Lock className="size-4 text-danger" strokeWidth={2} />}
                    title={ui.access.closeAll}
                    hint={ui.access.closeAllHint}
                    onSelect={() => update.mutate({ id: role.id, body: { permissions: [] } })}
                  />
                </>
              )}
              <MenuEntry
                icon={<Pencil className="size-4 text-info" strokeWidth={2} />}
                title={ui.access.renameRole}
                hint={ui.access.renameHint}
                onSelect={() => setDialog('rename')}
              />
              <MenuEntry
                icon={<Copy className="size-4 text-info" strokeWidth={2} />}
                title={ui.access.copyRole}
                hint={ui.access.copyRoleHint}
                onSelect={() =>
                  create.mutate({
                    name: ui.access.copyName(role.name),
                    description: role.description,
                    permissions: role.permissions,
                  })
                }
              />
              {lockedHint ? null : (
                <MenuEntry
                  icon={<Trash2 className="size-4 text-muted-foreground" strokeWidth={2} />}
                  title={ui.access.deleteRole}
                  hint={deleteBlocked ?? ui.access.deleteHint}
                  disabled={deleteBlocked !== null}
                  onSelect={() => setDialog('delete')}
                />
              )}
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

/** Пункт меню роли в грамматике Битрикса: значок, название и пояснение. */
function MenuEntry({
  icon,
  title,
  hint,
  disabled,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onSelect}
      className="items-start gap-3 rounded-md px-2.5 py-2"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}
