import type { Role } from '@nodus/contracts';

import { catalogPermissions } from './role-permission-rules.js';
import type { RoleRecord } from './roles.repository.js';

/**
 * Строка роли → DTO контракта (#379, ADR-0034): права только из каталога,
 * настоящие счётчики состава и до 4 подписанных аватаров. Одна точка для
 * `RolesService` и `RoleMembersService` — ответ обоих маршрутов совпадает.
 */
export function toRoleDto(
  record: RoleRecord,
  avatarUrl: (fileId: string | null) => string | null,
): Role {
  return {
    id: record.row.id,
    code: record.row.code,
    name: record.row.name,
    description: record.row.description,
    isSystem: record.row.isSystem,
    permissions: catalogPermissions(record.row.permissions.map((row) => row.permission)),
    memberCount: record.row._count.users,
    departmentCount: record.row._count.departments,
    preview: record.preview.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      avatarUrl: avatarUrl(user.avatarFileId),
    })),
  };
}
