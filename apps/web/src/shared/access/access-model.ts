import type { AccessModule, Permission, Role } from '@nodus/contracts';
import { SystemRole, ui, permissionsOfModule } from '@nodus/contracts';

import type { AccessMatrixCell, AccessMatrixRow } from './access-matrix.js';

/**
 * Чистая модель матрицы «право × роль» (#379, ADR-0034): строки — права
 * раздела из каталога контрактов, столбцы — роли портала, ячейка — флажок
 * с причиной недоступности. Без React и запросов: проверяется unit-тестами,
 * компонент только рисует.
 */

/** Строки вкладки раздела: id = право, порядок — каталога (ADR-0034). */
export function catalogRows(module: AccessModule): AccessMatrixRow[] {
  return permissionsOfModule(module).map((entry) => ({
    id: entry.permission,
    label: entry.label,
    description: entry.description,
  }));
}

/** Столбец неизменяем: права системной роли «Администратор» (Р4). */
export function isLockedRole(role: Pick<Role, 'code'>): boolean {
  return role.code === SystemRole.ADMIN;
}

/** Заблокированный столбец первым, остальные — в порядке сервера (Р8). */
export function orderColumns(roles: readonly Role[]): Role[] {
  return [...roles.filter(isLockedRole), ...roles.filter((role) => !isLockedRole(role))];
}

/**
 * Ячейка матрицы. Приоритет причин недоступности (§6.2 плана):
 * заблокирован (администратор) → только просмотр → чужое право (лишь для
 * неотмеченной ячейки: отзывать можно любое) → запрос в полёте.
 */
export function roleCell(input: {
  role: Role;
  permission: Permission;
  canManage: boolean;
  actorPermissions: readonly string[];
  pending: boolean;
}): AccessMatrixCell {
  const granted = input.role.permissions.includes(input.permission);
  if (isLockedRole(input.role)) {
    return { granted, disabled: true, hint: ui.access.lockedHint };
  }
  if (!input.canManage) {
    return { granted, disabled: true, hint: ui.access.readOnlyHint };
  }
  if (!granted && !input.actorPermissions.includes(input.permission)) {
    return { granted, disabled: true, hint: ui.access.notHeldHint };
  }
  if (input.pending) {
    return { granted, disabled: true, pending: true };
  }
  return { granted, disabled: false };
}
