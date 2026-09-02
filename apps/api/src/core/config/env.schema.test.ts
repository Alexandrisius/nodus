import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const VALID = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/nodus',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('принимает валидное окружение и применяет дефолты', () => {
    const env = validateEnv({ ...VALID });
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
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
