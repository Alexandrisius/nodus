import { defineConfig } from 'vitest/config';

/** Юнит-тесты gateway; интеграционные (живые PG/Redis) — отдельный конфиг. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
