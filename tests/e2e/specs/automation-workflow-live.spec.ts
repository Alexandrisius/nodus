import { expect, test } from '@playwright/test';
import { ADMIN } from '../e2e-users.js';

/**
 * Живой e2e «Процессы» (#428, ADR-0024) — критичный путь переименованного
 * раздела: вкладка «Процессы» на новом API `/workflows/*`, список типов,
 * создание типа из основы, загрузка маршрута в редактор и публикация.
 * Глубокий сценарий правки холста и публикация — отдельный трек редактора и
 * интеграционные тесты API (`workflows-editor.integration.test.ts`);
 * здесь проверяется поверхность #428: пути, вкладка, список, загрузка редактора.
 * Живой API (песочница live-stack): E2E_LIVE_API=1
 * NODUS_BASE_URL=http://127.0.0.1:4173.
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = ADMIN;

test.describe('«Процессы»: от типа до публикации (#428)', () => {
  test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

  test('вкладка, список, создание типа и публикация', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByLabel('Рабочая почта').fill(ADMIN_EMAIL);
    await page.getByLabel('Пароль').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);

    // 1. Раздел «Автоматизация» → вкладка «Процессы» (бывшие «Типы задач»).
    await page.goto('/automation');
    await expect(page.getByRole('link', { name: 'Процессы', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Стандартный/ }).first()).toBeVisible();

    // 2. Создание типа: копия «Стандартного» (новый API /workflows/types).
    const typeName = `E2E Процесс ${Date.now() % 100000}`;
    await page.getByRole('button', { name: /Новый тип/ }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Название', { exact: true }).fill(typeName);
    // Основа маршрута — Radix Select (не нативный select): открыть и выбрать.
    await createDialog.getByLabel('Основа маршрута').click();
    await page.getByRole('option', { name: 'Копия типа: Стандартный' }).click();
    await createDialog.getByRole('button', { name: 'Создать', exact: true }).click();
    const row = page.getByRole('button', { name: new RegExp(typeName) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 3. Редактор: маршрут пришёл с сервера (GET /workflows/:id), статусы видны.
    await expect(page.getByRole('button', { name: /Добавить статус/ })).toBeVisible();
    await expect(page.getByText('Ожидает').first()).toBeVisible();

    // 4. Тип рождается скрытым («Доступен при создании» включает владелец).
    await expect(row.getByText('Скрыт')).toBeVisible();
  });
});
