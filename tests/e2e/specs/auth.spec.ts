import { expect, test } from '@playwright/test';

/**
 * Критичный путь №1 (DoD, issue #3): логин.
 * Аноним → редирект на /login → вход администратором → список сотрудников →
 * logout → снова /login. Данные — сидинг (SEED_ADMIN_PASSWORD или дефолт).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@nodus.by';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Nodus!Admin2026';

test.describe('логин (критичный путь)', () => {
  test('аноним → /login → вход → справочник → выход', async ({ page }) => {
    // Анонимного пускают только на /login
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Nodus' })).toBeVisible();

    // Неверный пароль — понятная ошибка, остаёмся на /login
    await page.getByLabel('Рабочая почта').fill(ADMIN_EMAIL);
    await page.getByLabel('Пароль').fill('wrong-password');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль');

    // Верные креды — лендинг «/» → первый ВИДИМЫЙ модуль (концепт #4):
    // по умолчанию Главная (/home), приветствие по имени пользователя.
    await page.getByLabel('Пароль').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText(/Добр/).first()).toBeVisible();

    // Сессия переживает перезагрузку (refresh-cookie)
    await page.reload();
    await expect(page.getByText(/Добр/).first()).toBeVisible();

    // Выход (меню профиля в топбаре) → снова /login, главная закрыта
    await page.getByRole('button', { name: 'Профиль' }).click();
    await page.getByRole('menuitem', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
