import { Permission, SystemRole, type Role } from '@nodus/contracts';

/**
 * Правила прав ролей (#379, ADR-0034) — чистые функции без I/O: проверяются
 * unit-тестами, сервисы только собирают из них решения. Модель — Kubernetes
 * RBAC: `escalate` (нельзя выдать право, которого нет у тебя) и `bind`
 * (нельзя назначить роль с чужими правами).
 */

/** Права системной роли «Администратор» неизменяемы (Р4). */
export function isLockedRole(role: Pick<Role, 'code'>): boolean {
  return role.code === SystemRole.ADMIN;
}

/** Права из набора, которых у актора нет (порядок — входной). */
export function notHeld(
  actorPermissions: readonly string[],
  permissions: readonly Permission[],
): Permission[] {
  return permissions.filter((permission) => !actorPermissions.includes(permission));
}

/** Разница наборов прав: что добавляется и что снимается. */
export function permissionsDiff(
  before: readonly Permission[],
  next: readonly Permission[],
): { added: Permission[]; removed: Permission[] } {
  const beforeSet = new Set(before);
  const nextSet = new Set(next);
  return {
    added: next.filter((permission) => !beforeSet.has(permission)),
    removed: before.filter((permission) => !nextSet.has(permission)),
  };
}

/** Без дублей, по алфавиту — порядок прав в ответе API (Р8). */
export function uniquePermissions(permissions: readonly Permission[]): Permission[] {
  return [...new Set(permissions)].sort();
}

const CATALOG: ReadonlySet<string> = new Set(Object.values(Permission));

/** Права из каталога: строки вне каталога отфильтрованы (ответ = схема, Р8). */
export function catalogPermissions(permissions: readonly string[]): Permission[] {
  return permissions.filter((permission): permission is Permission => CATALOG.has(permission));
}

/** Роли, добавившиеся относительно снимка «до» (bind #490 проверяет их одни). */
export function addedRoleIds(before: readonly string[], after: readonly string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((id) => !beforeSet.has(id));
}

/** Недостающие права актора для НАБОРА ролей (bind #490): объединение прав
 *  ролей минус права актора; без дублей, по алфавиту (стабильный details). */
export function rolesNotHeld(
  actorPermissions: readonly string[],
  permissionsByRole: readonly (readonly string[])[],
): Permission[] {
  const union = new Set<string>();
  for (const permissions of permissionsByRole) {
    for (const permission of permissions) union.add(permission);
  }
  return notHeld(actorPermissions, uniquePermissions(catalogPermissions([...union])));
}
