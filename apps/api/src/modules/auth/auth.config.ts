/**
 * Конфигурация auth-модуля из окружения (config-no-secrets: значения — только env,
 * валидация обязательных — zod-схемой в core/config/env.schema.ts при старте).
 */

export interface AuthConfig {
  /** Секрет подписи access-JWT (минимум 32 символа — env.schema). */
  jwtSecret: string;
  /** TTL access-токена в секундах (канон стека: 15 минут). */
  accessTtlSeconds: number;
  /** TTL refresh-сессии в днях (канон стека: 30 дней, скользящая ротация). */
  refreshTtlDays: number;
  /** Secure-флаг refresh-cookie (https). По умолчанию — NODE_ENV=production. */
  cookieSecure: boolean;
  /** Имя refresh-cookie. */
  refreshCookieName: string;
  /** Path refresh-cookie — только auth-эндпоинты видят refresh-токен. */
  refreshCookiePath: string;
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET не задан');
  }
  return {
    jwtSecret,
    accessTtlSeconds: Number(env.JWT_ACCESS_TTL_SECONDS ?? 900),
    refreshTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
    refreshCookieName: 'nodus_refresh',
    refreshCookiePath: '/api/v1/auth',
  };
}
