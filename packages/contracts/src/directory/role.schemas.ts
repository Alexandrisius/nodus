import { z } from 'zod';

import { Permission } from '../auth/permission.js';

/**
 * Роли (directory.Role) — бизнес-данные, не код (навык auth-route-guards):
 * администратор собирает роли из прав каталога Permission, права
 * разворачиваются в JWT при логине. Системные роли (isSystem) не удаляются.
 */

export const roleCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*$/, { message: 'Expected kebab-case code' })
  .max(64);

export const roleSchema = z.object({
  id: z.uuid(),
  code: roleCodeSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  /** Системная роль (seed): не удаляется и не переименовывается кодом. */
  isSystem: z.boolean(),
  permissions: z.array(z.enum(Permission)),
});

export type Role = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  code: roleCodeSchema,
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(512).nullable().default(null),
  permissions: z.array(z.enum(Permission)).default([]),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.omit({ code: true }).partial();

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

/** Назначение ролей сотруднику (полная замена набора). */
export const assignUserRolesSchema = z.object({
  roleIds: z.array(z.uuid()).max(50),
});

export type AssignUserRolesDto = z.infer<typeof assignUserRolesSchema>;
