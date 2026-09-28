/**
 * Конфигурация модуля files из окружения (config-no-secrets: значения — только
 * env, валидация обязательных — zod-схемой в core/config/env.schema.ts при
 * старте; здесь — приведение для прямого создания в тестах).
 */
import type { InjectionToken } from '@nestjs/common';

export interface FilesConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

/** DI-токен конфигурации модуля (интерфейс — не значение, токен отдельный). */
export const FILES_CONFIG: InjectionToken = 'FILES_CONFIG';

/** Жёсткий потолок хранилища на файл (ADR-0013); контуры ниже — лимиты
 *  модулей-потребителей (чат: 100 МБ, вердикт владельца 24.09). */
export const STORAGE_MAX_FILE_BYTES = 200 * 1024 * 1024;

export function getFilesConfig(env: NodeJS.ProcessEnv = process.env): FilesConfig {
  const accessKey = env.STORAGE_ACCESS_KEY;
  const secretKey = env.STORAGE_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY не заданы');
  }
  return {
    endpoint: env.STORAGE_ENDPOINT ?? '127.0.0.1',
    port: Number(env.STORAGE_PORT ?? 9000),
    useSSL: env.STORAGE_USE_SSL === 'true',
    bucket: env.STORAGE_BUCKET ?? 'nodus-files',
    accessKey,
    secretKey,
  };
}
