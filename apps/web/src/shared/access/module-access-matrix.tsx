import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { AccessModule, Permission, Role } from '@nodus/contracts';
import { permissionsOfModule, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';

import {
  rolePermissionKey,
  usePendingRolePermissions,
  useRoles,
  useToggleRolePermission,
} from '../api/roles.js';
import { isTempRole } from '../api/role-admin.js';
import { useAuthStore } from '../auth-store.js';
import { AccessMatrix, AccessMatrixSkeleton, type AccessMatrixColumn } from './access-matrix.js';
import { catalogRows, isLockedRole, orderColumns, roleCell } from './access-model.js';
import { CreateRoleDialog } from './role-dialogs.js';
import { RoleColumnHeader } from './role-column-header.js';
import { useCanManageRoles } from './use-can-manage-roles.js';

/** Пустой массив-константа: селектор стора не создаёт новую ссылку на каждый рендер. */
const NO_PERMISSIONS: readonly string[] = [];

function columnsOf(
  roles: readonly Role[],
  canManage: boolean,
  modulePermissions: readonly Permission[],
): AccessMatrixColumn[] {
  return orderColumns(roles).map((role) => {
    const lockedHint = isLockedRole(role) ? ui.access.lockedHint : undefined;
    return {
      id: role.id,
      name: role.name,
      title: role.description ?? undefined,
      lockedHint,
      header: (
        <RoleColumnHeader
          role={role}
          canManage={canManage}
          lockedHint={lockedHint}
          temporary={isTempRole(role)}
          modulePermissions={modulePermissions}
        />
      ),
    };
  });
}

/**
 * Тело вкладки «Права доступа» раздела (#379, ADR-0034): срез каталога прав
 * по разделу против всех ролей портала. Строки — права раздела в порядке
 * каталога, столбцы — роли (заблокированный «Администратор» первым).
 * Переключение оптимистично и точечно (`useToggleRolePermission`); без права
 * «Управлять ролями и правами» — только просмотр с видимой подсказкой.
 * У раздела без прав вкладки нет вовсе — компонент возвращает null.
 */
export function ModuleAccessMatrix({ module }: { module: AccessModule }) {
  const rows = useMemo(() => catalogRows(module), [module]);
  const modulePermissions = useMemo(
    () => permissionsOfModule(module).map((entry) => entry.permission),
    [module],
  );
  const canManage = useCanManageRoles();
  const actorPermissions = useAuthStore((s) => s.user?.permissions) ?? NO_PERMISSIONS;
  const roles = useRoles();
  const pending = usePendingRolePermissions();
  const toggle = useToggleRolePermission();
  const readOnlyHintId = useId();
  const [createRole, setCreateRole] = useState(false);
  const roleById = useMemo(
    () => new Map((roles.data ?? []).map((role) => [role.id, role])),
    [roles.data],
  );

  // У раздела нет прав — вкладки нет вовсе (её не создаёт `accessTab`).
  if (rows.length === 0) return null;

  const columns = columnsOf(roles.data ?? [], canManage, modulePermissions);

  return (
    <div className="relative flex h-full flex-col">
      {canManage ? null : (
        <div className="flex h-14 shrink-0 items-center justify-end gap-2 px-6">
          <span id={readOnlyHintId} className="truncate text-xs text-muted-foreground">
            {ui.access.readOnlyHint}
          </span>
          <span className="shrink-0 rounded-full border border-border bg-accent/40 px-2.5 py-1 text-xs text-muted-foreground">
            {ui.access.readOnlyBadge}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {roles.isPending ? (
          <AccessMatrixSkeleton rowHeader={ui.access.rowHeader} rows={rows} />
        ) : roles.isError ? (
          <div className="flex h-full items-center justify-center">
            <Empty>
              <EmptyTitle>{ui.access.loadError}</EmptyTitle>
              <Button variant="outline" size="sm" onClick={() => void roles.refetch()}>
                {ui.access.retry}
              </Button>
            </Empty>
          </div>
        ) : (
          <AccessMatrix
            label={ui.access.tableLabel}
            rowHeader={ui.access.rowHeader}
            rows={rows}
            columns={columns}
            describedBy={canManage ? undefined : readOnlyHintId}
            trailingHeader={
              canManage ? (
                <button
                  type="button"
                  aria-label={ui.access.createRole}
                  onClick={() => setCreateRole(true)}
                  className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/30"
                >
                  <Plus className="size-4" strokeWidth={1.75} />
                </button>
              ) : undefined
            }
            cell={(rowId, columnId) => {
              const role = roleById.get(columnId);
              if (!role) return { granted: false, disabled: true };
              return roleCell({
                role,
                permission: rowId as Permission,
                canManage,
                actorPermissions,
                pending: isTempRole(role) || pending.has(rolePermissionKey(role.id, rowId)),
              });
            }}
            onToggle={(rowId, columnId, next) =>
              toggle.mutate({
                roleId: columnId,
                permission: rowId as Permission,
                granted: next,
              })
            }
            cellLabel={(row, column) => ui.access.cellLabel(row.label, column.name)}
          />
        )}
      </div>

      {createRole ? <CreateRoleDialog onClose={() => setCreateRole(false)} /> : null}

      <p className="shrink-0 px-6 pb-4 pt-2 text-xs text-muted-foreground">{ui.access.footnote}</p>
    </div>
  );
}
