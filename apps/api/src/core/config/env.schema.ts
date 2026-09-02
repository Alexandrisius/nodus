import { z } from 'zod';

/**
 * Валидация env при старте (config-no-secrets: fail-fast, без секретов в коде).
 * Вызывается в main.ts до создания приложения: кривое окружение = понятная
 * ошибка сразу, а не TypeError в рантайме (опыт NormaCore, issue #2).
 */
const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url({ protocol: /^postgresql?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Секрет подписи access-JWT (auth); ≥ 32 символов, только из env. */
  JWT_SECRET: z.string().min(32),
  /** TTL access-токена, секунды (канон: 900 = 15 минут). */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  /** TTL refresh-сессии, дни (канон: 30, скользящая ротация). */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** Secure-флаг refresh-cookie; по умолчанию — NODE_ENV=production. */
  COOKIE_SECURE: z.stringbool().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Парсит process.env; при ошибке бросает с перечнем невалидных переменных. */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Невалидное окружение: ${problems}`);
  }
  return result.data;
}
