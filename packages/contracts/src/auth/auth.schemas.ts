import { z } from 'zod';

/**
 * Контракты модуля auth: логин, токены, сессии, смена пароля.
 * Правила паролей — по навыку auth-password-hashing (Argon2id + zod на границе).
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Политика паролей: 12+ символов, верхний/нижний регистр, цифра, спецсимвол. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: 'Password must be at least 12 characters' })
  .max(PASSWORD_MAX_LENGTH)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  });

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Ответ логина/обновления. Refresh-токен в теле НЕ передаётся —
 * он живёт в httpOnly-cookie `nodus_refresh` (path=/api/v1/auth).
 */
export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  /** Срок жизни access-токена в секундах; клиент обновляет заранее. */
  expiresIn: z.number().int().positive(),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

/** Сессия в списке «Мои сессии» (без хэшей токенов). */
export const sessionInfoSchema = z.object({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Текущая сессия запроса (её нельзя отозвать через revoke — только logout). */
  current: z.boolean(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;
