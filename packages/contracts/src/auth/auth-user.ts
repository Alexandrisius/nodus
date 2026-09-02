import { z } from 'zod';

/**
 * Текущий пользователь запроса (канон — patterns.md: `@GetUser()` + тип `AuthUser`).
 * Наполняется auth-модулем (отдельный issue) из сессии/JWT;
 * `PermissionGuard` проверяет `permissions`.
 */
export const authUserSchema = z.object({
  /** UUID пользователя (directory.User). */
  id: z.uuid(),
  /** Корпоративная почта (логин). */
  email: z.email(),
  /** ФИО для отображения. */
  displayName: z.string().min(1),
  /** Развёрнутый набор прав (роль → permissions на бэке). */
  permissions: z.array(z.string().min(1)),
});

export type AuthUser = z.infer<typeof authUserSchema>;
