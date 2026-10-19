import { defineConfig } from '@playwright/test';

/**
 * E2E критичных путей (Playwright CLI, НЕ MCP — AGENTS.md).
 * Цель — живой стек: NODUS_BASE_URL (по умолчанию песочница live-stack
 * :4173; в CI — vite preview :4173). Прод :3000 — только явным env: спеки
 * входят тестовыми паролями (#247), по умолчанию стучаться в прод нельзя —
 * неверные пароли копят блокировку входа реальных учёток. Только критичные
 * пути (DoD): логин первым.
 */
export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // критичные пути последовательно: состояние общее (сессии, рейт-лимит)
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.NODUS_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
