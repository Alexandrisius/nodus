import type { ReactNode } from 'react';
import type { UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import type { DataTableField } from '../../../shared/views/data-table.js';

/** HR-статус сотрудника (справочник, I15): работает / уволен. */
export function UserStatusChip({ status }: { status: UserListItem['status'] }) {
  return (
    <NodeChip tone={status === 'active' ? 'success' : 'muted'} className="shrink-0">
      {status === 'active' ? ui.employees.statusActive : ui.employees.statusDeactivated}
    </NodeChip>
  );
}

function personCell(name: string | null): ReactNode {
  if (!name) return <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>;
  return (
    <>
      <PersonAvatar name={name} className="size-6 shrink-0" />
      <span className="truncate">{name}</span>
    </>
  );
}

/**
 * Реестр колонок списка сотрудников (ключ вида `employees.list`): новое
 * поле = +1 запись (shared/views, шестерёнка + ручка ресайза). Руководитель
 * резолвится из того же списка (managerId → displayName).
 */
export function employeeListFields(
  byId: ReadonlyMap<string, UserListItem>,
): DataTableField<UserListItem>[] {
  return [
    {
      id: 'displayName',
      label: ui.employees.fieldEmployee,
      defaultVisible: true,
      defaultWidth: 240,
      minWidth: 160,
      maxWidth: 480,
      locked: true,
      render: (user) => (
        <>
          <PersonAvatar
            name={user.displayName}
            avatarUrl={user.avatarUrl}
            className="size-6 shrink-0"
          />
          <span className="truncate text-sm font-medium">{user.displayName}</span>
        </>
      ),
    },
    {
      id: 'positionName',
      label: ui.employees.position,
      defaultVisible: true,
      defaultWidth: 220,
      minWidth: 120,
      render: (user) =>
        user.positionName ? (
          <span className="truncate text-sm">{user.positionName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>
        ),
    },
    {
      id: 'departmentName',
      label: ui.employees.department,
      defaultVisible: true,
      defaultWidth: 200,
      minWidth: 120,
      render: (user) =>
        user.departmentName ? (
          <span className="truncate font-mono text-[11px] text-info/80">{user.departmentName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>
        ),
    },
    {
      id: 'email',
      label: ui.employees.email,
      defaultVisible: true,
      defaultWidth: 240,
      minWidth: 160,
      render: (user) => (
        <span className="truncate font-mono text-[11px] text-muted-foreground">{user.email}</span>
      ),
    },
    {
      id: 'manager',
      label: ui.employees.fieldManager,
      defaultVisible: true,
      defaultWidth: 200,
      minWidth: 110,
      render: (user) =>
        personCell(user.managerId ? (byId.get(user.managerId)?.displayName ?? null) : null),
    },
    {
      id: 'status',
      label: ui.employees.fieldStatus,
      defaultVisible: false,
      defaultWidth: 124,
      minWidth: 104,
      render: (user) => <UserStatusChip status={user.status} />,
    },
  ];
}
