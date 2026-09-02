import { defineConfig } from 'vitest/config';

/**
 * Unit-тесты (Vitest): рядом с кодом, без инфраструктуры.
 * Интеграционные (test/integration, Nest-приложение через SWC, реальные
 * PG/Redis) — отдельный конфиг `vitest.integration.config.ts`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
