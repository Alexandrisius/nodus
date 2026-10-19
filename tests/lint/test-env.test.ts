import { afterEach, describe, expect, it } from 'vitest';
import {
  assertIsolatedTestEnv,
  INTEGRATION_TEST_BUCKET,
  isolateIntegrationEnv,
} from '@nodus/config/test-env';

/** Изоляция тест-контура (#332, #324): Redis db 15, свой бакет и учётка. */
describe('@nodus/config/test-env', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function setEnv(env: Record<string, string | undefined>): void {
    for (const key of [
      'REDIS_URL',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY',
      'STORAGE_SECRET_KEY',
      'STORAGE_TEST_ACCESS_KEY',
      'STORAGE_TEST_SECRET_KEY',
    ]) {
      delete process.env[key];
    }
    Object.assign(process.env, env);
  }

  it('Redis → db 15 с сохранением пароля и хоста; бакет — тестовый', () => {
    setEnv({ REDIS_URL: 'redis://:p%40ss@127.0.0.1:6379/0', STORAGE_BUCKET: 'nodus-files' });
    isolateIntegrationEnv();
    expect(process.env.REDIS_URL).toBe('redis://:p%40ss@127.0.0.1:6379/15');
    expect(process.env.STORAGE_BUCKET).toBe(INTEGRATION_TEST_BUCKET);
    expect(() => assertIsolatedTestEnv()).not.toThrow();
  });

  it('учётка тест-контура задана → подменяет учётку api (машина разработки)', () => {
    setEnv({
      STORAGE_ACCESS_KEY: 'nodus-api',
      STORAGE_SECRET_KEY: 'api-secret',
      STORAGE_TEST_ACCESS_KEY: 'nodus-test',
      STORAGE_TEST_SECRET_KEY: 'test-secret',
    });
    isolateIntegrationEnv();
    expect(process.env.STORAGE_ACCESS_KEY).toBe('nodus-test');
    expect(process.env.STORAGE_SECRET_KEY).toBe('test-secret');
  });

  it('учётки тест-контура нет (CI — root) → учётка не трогается', () => {
    setEnv({ STORAGE_ACCESS_KEY: 'root', STORAGE_SECRET_KEY: 'root-secret' });
    isolateIntegrationEnv();
    expect(process.env.STORAGE_ACCESS_KEY).toBe('root');
    expect(process.env.STORAGE_SECRET_KEY).toBe('root-secret');
  });

  it('чужой Redis db или бакет — громкий отказ', () => {
    setEnv({ REDIS_URL: 'redis://127.0.0.1:6379/0', STORAGE_BUCKET: INTEGRATION_TEST_BUCKET });
    expect(() => assertIsolatedTestEnv()).toThrow(/db 15/);
    setEnv({ STORAGE_BUCKET: 'nodus-files' });
    expect(() => assertIsolatedTestEnv()).toThrow(/nodus-test-files/);
  });
});
