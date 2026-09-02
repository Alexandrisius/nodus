import { defineConfig } from '@playwright/test';

/**
 * E2E критичных путей (Playwright CLI, НЕ MCP — AGENTS.md).
 * Цель — живой стек: NODUS_BASE_URL (docker nginx :3000 локально,
 * vite preview :4173 в CI). Только критичные пути (DoD): логин первым.
 */
export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // критичные пути последовательно: состояние общее (сессии, рейт-лимит)
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.NODUS_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
