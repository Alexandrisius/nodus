import { expect, test } from '@playwright/test';
import { ADMIN } from '../e2e-users.js';

/**
 * Живой e2e #378 — критичный путь спеки (раздел «Тесты»): админ копирует
 * «Стандартный» в новый тип, добавляет статус «Проверка ГИПа» (этап
 * «Утверждение»), рисует кнопку «Отправить ГИПу» из «В работе» и делает её
 * главной, публикует, включает «Доступен при создании», создаёт задачу
 * этого типа, берёт её в работу — главная кнопка панели «Отправить ГИПу»,
 * нажимает — статус «Проверка ГИПа». Селекторы role-based/label-based.
 * Живой API (песочница live-stack): E2E_LIVE_API=1
 * NODUS_BASE_URL=http://127.0.0.1:4173.
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = ADMIN;

test.describe('редактор маршрутов: от типа до задачи (#378)', () => {
  test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

  test('сквозной путь администратора', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/');
    await page.getByLabel('Рабочая почта').fill(ADMIN_EMAIL);
    await page.getByLabel('Пароль').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);

    // 1. Библиотека типов: копия «Стандартного».
    await page.goto('/automation');
    await expect(page.getByRole('button', { name: /Стандартный/ }).first()).toBeVisible();
    const typeName = `E2E ГИП ${Date.now() % 100000}`;
    await page.getByRole('button', { name: /Новый тип/ }).click();
    await page.getByLabel('Название', { exact: true }).fill(typeName);
    await page.getByLabel('Основа маршрута').selectOption({ label: 'Копия типа: Стандартный' });
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    const row = page.getByRole('button', { name: new RegExp(typeName) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 2. «+ Статус» → этап «Утверждение»; имя в инспекторе.
    await page.getByRole('button', { name: /Добавить статус/ }).click();
    await page.getByRole('menuitem', { name: /работа сдана и ждёт проверки/ }).click();
    const stageNameInput = page.getByLabel('Название', { exact: true });
    await expect(stageNameInput).toBeVisible();
    await stageNameInput.fill('Проверка ГИПа');

    // 3. «+ Кнопка» из «В работы» → «Проверка ГИПа», показ «Главная».
    // Тулбарная «+ Кнопка» (в инспекторе статуса есть своя — first).
    await page.getByRole('button', { name: 'Кнопка', exact: true }).first().click();
    await page.getByRole('combobox', { name: 'Откуда' }).click();
    await page.getByRole('option', { name: /В работе/ }).click();
    await page.getByRole('combobox', { name: 'Куда', exact: true }).click();
    await page.getByRole('option', { name: /Проверка ГИПа/ }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.getByLabel('Название кнопки').fill('Отправить ГИПу');
    await page.getByRole('button', { name: 'Главная', exact: true }).click();

    // 4. Публикация (тулбар → подтверждение в диалоге).
    await page.getByRole('button', { name: 'Опубликовать' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Опубликовать' }).click();
    await expect(page.getByText('Маршрут опубликован')).toBeVisible({ timeout: 15_000 });

    // 5. «Доступен при создании задач» (меню строки → настройки типа).
    await row.hover();
    await page
      .getByRole('button', { name: /меню строки|Действия/ })
      .or(page.locator('[aria-label="⋯"]'))
      .first()
      .click();
    await page.getByRole('menuitem', { name: /Настройки типа/ }).click();
    await page.getByRole('switch').click();
    await page.keyboard.press('Escape');

    // 6. Задача нового типа (экспресс-форма журнала задач).
    await page.goto('/tasks?view=list');
    // Тулбарная «Создать» (у колонок канбана свои плюсики).
    await page.getByRole('button', { name: 'Создать', exact: true }).first().click();
    await page.getByPlaceholder('Название задачи').fill(`Задача ${typeName}`);
    await page.getByRole('combobox', { name: 'Тип' }).click();
    await page.getByRole('option', { name: new RegExp(typeName) }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Создать', exact: true }).click();

    // Карточка задачи из журнала.
    await page.getByText(`Задача ${typeName}`).first().click();
    await expect(page.getByRole('button', { name: /Взять в работу/ }).first()).toBeVisible({
      timeout: 10_000,
    });

    // 7–8. Взять в работу → главная «Отправить ГИПу» → статус «Проверка ГИПа».
    await page
      .getByRole('button', { name: /Взять в работу/ })
      .first()
      .click();
    const gip = page.getByRole('button', { name: /Отправить ГИПу/ }).first();
    await expect(gip).toBeVisible({ timeout: 10_000 });
    await gip.click();
    await expect(page.getByText('Проверка ГИПа').first()).toBeVisible({ timeout: 10_000 });
  });
});
