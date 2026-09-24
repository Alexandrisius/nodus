import { expect, test } from '@playwright/test';

/**
 * Живой логин (#48): критичный путь на ЖИВОМ API — сборка без MSW-воркера
 * (VITE_API_MOCK пуст/false), NODUS_BASE_URL указывает на такой деплой
 * (vite preview с прокси /api на живой бэкенд или docker-сборка).
 * По умолчанию ПРОПУСКАЕТСЯ: CI и локальный дефолт гоняют моковые e2e
 * (auth.spec.ts). Запуск: E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@nodus.by';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Nodus!Admin2026';

test.describe('живой логин (#48)', () => {
  // Понятный пропуск вместо молчаливого: почему тест не выполнялся.
  test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку (без моков)');

  test('вход администратором → ФИО на портале', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Nodus' })).toBeVisible();

    await page.getByLabel('Рабочая почта').fill(ADMIN_EMAIL);
    await page.getByLabel('Пароль').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();

    // ФИО живого пользователя (сид: «Администратор Системный») — в приветствии.
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText(/Добр/).first()).toBeVisible();

    // Сессия переживает перезагрузку (refresh-cookie живого API).
    await page.reload();
    await expect(page.getByText(/Добр/).first()).toBeVisible();
  });
});
