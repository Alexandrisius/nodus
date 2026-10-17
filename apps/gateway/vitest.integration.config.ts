import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';
import { isolateIntegrationRedis } from '@nodus/config/test-env';

// Интеграционным тестам нужны DATABASE_URL/REDIS_URL/JWT_SECRET — корневой .env.
loadEnv({ path: new URL('../../.env', import.meta.url) });
// Redis тест-контура — свой db, не db живого стека из .env (#332).
isolateIntegrationRedis();

/**
 * Сквозные тесты gateway на реальных PG/Redis: живой Socket.IO-сервер +
 * socket.io-client, XADD в настоящий стрим (изолированная consumer group).
 * Набор скипается без env.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    maxWorkers: 1,
    maxConcurrency: 1,
    sequence: { concurrent: false },
  },
});
