import { config as loadEnv } from 'dotenv';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Интеграционным тестам нужны DATABASE_URL/REDIS_URL — подхватываем корневой .env.
loadEnv({ path: new URL('../../.env', import.meta.url) });

/**
 * Интеграционные тесты (patterns.md): реальные PostgreSQL/Redis, не моки.
 * Локально — docker-контейнеры nodus_*; CI — service-контейнеры.
 * Требуют env DATABASE_URL и REDIS_URL (иначе наборы скипаются).
 * SWC — потому что oxc/rolldown не эмитит decorator metadata, нужную Nest DI.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Общая тестовая БД — файлы последовательно, без параллелизма.
    pool: 'forks',
    maxWorkers: 1,
    maxConcurrency: 1,
    sequence: { concurrent: false },
  },
});
