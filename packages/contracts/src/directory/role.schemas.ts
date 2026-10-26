import { z } from 'zod';

import { Permission } from '../auth/permission.js';
import { userRefSchema } from './user-ref.schema.js';

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
  /** Сотрудников, назначенных роли напрямую (#379, ADR-0034). */
  memberCount: z.number().int().nonnegative(),
  /** Подразделений, чьи сотрудники получают роль целиком. */
  departmentCount: z.number().int().nonnegative(),
  /** До 4 назначенных сотрудников — аватары в шапке столбца матрицы. */
  preview: z.array(userRefSchema).max(4),
});

export type Role = z.infer<typeof roleSchema>;

/** Подразделение в составе роли (денормализованное имя для UI). */
export const roleDepartmentRefSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});
export type RoleDepartmentRef = z.infer<typeof roleDepartmentRefSchema>;

/** Состав роли: `GET /directory/roles/:id/members` (ADR-0034). Сотрудник
 *  подразделения получает роль целиком — права складываются, как у
 *  нескольких прямых ролей. */
export const roleMembersSchema = z.object({
  users: z.array(userRefSchema),
  departments: z.array(roleDepartmentRefSchema),
});
export type RoleMembers = z.infer<typeof roleMembersSchema>;

/** Системная роль с неизменяемыми правами: `PUT/DELETE …/permissions`,
 *  PATCH с `permissions` → `409 ROLE_LOCKED` (ADR-0034). Имя и описание
 *  менять можно; удаление запрещено флагом `isSystem`. */
export const SystemRole = { ADMIN: 'admin' } as const;

export const createRoleSchema = z.object({
  /** Не задан — сервер выдаёт `role-<8 hex>`: человек вводит только название. */
  code: roleCodeSchema.optional(),
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(512).nullable().default(null),
  permissions: z.array(z.enum(Permission)).default([]),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;

/** Частичная правка: поля без значения НЕ трогаются. Нельзя строить из
 *  `createRoleSchema.partial()` — дефолты создания (`permissions: []`,
 *  `description: null`) протекают в разбор и «переименование» стирало права. */
export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  description: z.string().trim().max(512).nullable().optional(),
  permissions: z.array(z.enum(Permission)).optional(),
});

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

/** Назначение ролей сотруднику (полная замена набора). */
export const assignUserRolesSchema = z.object({
  roleIds: z.array(z.uuid()).max(50),
});

export type AssignUserRolesDto = z.infer<typeof assignUserRolesSchema>;
