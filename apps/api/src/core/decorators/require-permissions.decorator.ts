import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Permission } from '@nodus/contracts';

export const PERMISSIONS_KEY = 'nodus:permissions';

/**
 * Требуемые права на маршрут (канон — patterns.md):
 * `@RequirePermissions(Permission.TASK_CREATE)` — только через enum contracts,
 * строковые литералы прав запрещены. Проверяет `PermissionGuard` (I8: на API, не в UI).
 */
export const RequirePermissions = (
  ...permissions: Permission[]
): CustomDecorator<typeof PERMISSIONS_KEY> => SetMetadata(PERMISSIONS_KEY, permissions);
