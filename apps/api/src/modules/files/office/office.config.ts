import type { InjectionToken } from '@nestjs/common';

/** Конфигурация движка офисного просмотра (#138) из окружения
 *  (config-no-secrets: валидация — env.schema при старте). */
export interface OfficeConfig {
  enabled: boolean;
  editEnabled: boolean;
  jwtSecret: string | null;
  /** База api ДЛЯ документ-сервера (внутренняя сеть). */
  apiInternalUrl: string;
  /** База документ-сервера ДЛЯ api (скачивание сохранений колбэка). */
  internalUrl: string;
  maxViewBytes: number;
}

export const OFFICE_CONFIG: InjectionToken = 'OFFICE_CONFIG';

export function getOfficeConfig(env: NodeJS.ProcessEnv = process.env): OfficeConfig {
  return {
    enabled: env.OFFICE_ENABLED === 'true' && Boolean(env.OFFICE_JWT_SECRET),
    editEnabled: env.OFFICE_EDIT_ENABLED === 'true',
    jwtSecret: env.OFFICE_JWT_SECRET ?? null,
    apiInternalUrl: stripTrailingSlash(env.OFFICE_API_INTERNAL_URL ?? 'http://127.0.0.1:3001'),
    internalUrl: stripTrailingSlash(env.OFFICE_INTERNAL_URL ?? 'http://127.0.0.1:3013'),
    maxViewBytes: Number(env.OFFICE_MAX_VIEW_BYTES ?? 52_428_800),
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
