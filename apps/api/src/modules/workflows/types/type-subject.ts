import { ADMIN_ROLE_CODE, type TypeAccessSubject } from '@nodus/contracts';

import type { RoleMembershipReader } from '../../../core/ports/role-membership.port.js';

/**
 * Роли смотрящего для расчёта доступа к типу (#432, Р6): эффективные роли
 * (прямые ∪ подразделения и предки) + признак администратора по КОДУ роли, а
 * не по id: справочник ролей — данные, и админская роль у каждой установки
 * своя. Одна точка для списка типов, `resolveType` и каталога стадий.
 */
export async function typeSubjectOf(
  membership: RoleMembershipReader,
  userId: string,
): Promise<TypeAccessSubject> {
  const roles = await membership.effectiveRoles(userId);
  return {
    roleIds: roles.map((role) => role.id),
    isAdmin: roles.some((role) => role.code === ADMIN_ROLE_CODE),
  };
}
