import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const VALID = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/nodus',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'env-test-secret-key-min-32-chars-long',
  STORAGE_ACCESS_KEY: 'nodus-api',
  STORAGE_SECRET_KEY: 'storage-secret-min-8',
  STORAGE_URL_SECRET: 'storage-url-secret-min-32-chars-xx',
};

describe('validateEnv', () => {
  it('принимает валидное окружение и применяет дефолты', () => {
    const env = validateEnv({ ...VALID });
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.STORAGE_ENDPOINT).toBe('127.0.0.1');
    expect(env.STORAGE_BUCKET).toBe('nodus-files');
  });

  it('требует секреты файлового хранилища (#57)', () => {
    expect(() => validateEnv({ ...VALID, STORAGE_URL_SECRET: 'short' })).toThrow(
      /Невалидное окружение.*STORAGE_URL_SECRET/s,
    );
    expect(() => validateEnv({ ...VALID, STORAGE_SECRET_KEY: undefined })).toThrow(
      /Невалидное окружение.*STORAGE_SECRET_KEY/s,
    );
  });

  it('падает с понятным сообщением без DATABASE_URL', () => {
    expect(() => validateEnv({ REDIS_URL: VALID.REDIS_URL })).toThrow(
      /Невалидное окружение.*DATABASE_URL/s,
    );
  });

  it('отклоняет не-postgresql DATABASE_URL', () => {
    expect(() => validateEnv({ ...VALID, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(
      /Невалидное окружение/,
    );
  });
});
