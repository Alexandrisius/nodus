import { z } from 'zod';

/**
 * Валидация env при старте (config-no-secrets: fail-fast, без секретов в коде).
 * Вызывается в main.ts до создания приложения: кривое окружение = понятная
 * ошибка сразу, а не TypeError в рантайме (опыт NormaCore, issue #2).
 */
const envSchema = z
  .object({
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
    /** Общий IP-rate-limit (запросов/мин). Дефолт 3000: офис за NAT — один IP
     *  на ~170 человек, каждое WS-событие = рефеч; 300/мин душили бы пилот
     *  (вердикт владельца 25.09, раунд 2 #104). Брутфорс-логин защищён отдельно
     *  (Redis-счётчик AuthService), k6 поднимает планку выше через env. */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(3000),
    /** Файловое хранилище (#57, ADR-0013): MinIO/S3. Endpoint — по умолчанию
     *  host-dev (compose публикует MinIO на 127.0.0.1); в docker api получает
     *  STORAGE_ENDPOINT=nodus_minio из compose. */
    STORAGE_ENDPOINT: z.string().min(1).default('127.0.0.1'),
    STORAGE_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
    STORAGE_USE_SSL: z.stringbool().optional(),
    STORAGE_BUCKET: z.string().min(3).max(63).default('nodus-files'),
    STORAGE_ACCESS_KEY: z.string().min(3),
    STORAGE_SECRET_KEY: z.string().min(8),
    /** Секрет подписи ссылок отдачи файлов (HMAC, ADR-0013); ≠ JWT_SECRET. */
    STORAGE_URL_SECRET: z.string().min(32),
    /** TTL подписи ссылок отдачи, секунды (24 ч: кэш браузера + рефечи ленты). */
    STORAGE_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(86_400),
    /** Движок офисного просмотра ONLYOFFICE (#138): выключен, пока не поднят
     *  контейнер документ-сервера (compose profile `office`). */
    OFFICE_ENABLED: z.stringbool().optional(),
    /** Правка в редакторе — отдельный флаг (пилот: сначала просмотр). */
    OFFICE_EDIT_ENABLED: z.stringbool().optional(),
    /** Общий секрет JWT с документ-сервером (требуется при OFFICE_ENABLED). */
    OFFICE_JWT_SECRET: z.string().min(32).optional(),
    /** Как api обращается к документ-серверу (скачивание сохранённых файлов). */
    OFFICE_INTERNAL_URL: z.url().default('http://127.0.0.1:3013'),
    /** Как документ-сервер обращается к api (document.url + callbackUrl):
     *  внутренний адрес сети, НЕ браузерный origin. */
    OFFICE_API_INTERNAL_URL: z.url().default('http://127.0.0.1:3001'),
    /** Потолок размера файла на открытие в редакторе (50 МБ: гигантские листы
     *  открываются карточкой скачивания — спека #138). */
    OFFICE_MAX_VIEW_BYTES: z.coerce.number().int().min(1).default(52_428_800),
  })
  .refine((env) => !env.OFFICE_ENABLED || Boolean(env.OFFICE_JWT_SECRET), {
    message: 'OFFICE_JWT_SECRET обязателен при OFFICE_ENABLED',
    path: ['OFFICE_JWT_SECRET'],
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
