import { expect, test } from '@playwright/test';

/**
 * Живой e2e «создание задачи» (#311, критичный путь модуля задач): песочница
 * live-stack (:4173, БД nodus_night). Запуск:
 * E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173
 * Путь: экспресс-форма → карточка на «Моём плане» без перезагрузки →
 * чек-лист и подзадача в карточке → «Начать» → внести время →
 * «Завершить» упирается в гейт подзадач → «Завершить вместе с подзадачами».
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const EMAIL = process.env.E2E_USER_EMAIL ?? 'night-a@nodus.local';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Night-Probe-100!';

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

test('задача: создание → работа → время → завершение с подзадачами (#311)', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const title = `E2E задача ${stamp}`;

  await page.goto('/');
  await page.getByLabel('Рабочая почта').fill(EMAIL);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole('link', { name: 'Задачи' }).first().click();
  await expect(page).toHaveURL(/\/tasks/);

  // Экспресс-форма: тип «Задача» по умолчанию, ответственный — я.
  await page.getByRole('button', { name: 'Создать', exact: true }).first().click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Тип задачи')).toContainText('Задача');
  await form.getByLabel('Название задачи').fill(title);
  await form.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Задача создана')).toBeVisible();

  // Карточка появляется на доске без перезагрузки (фидбек владельца 16.10).
  const boardCard = page.getByText(title).first();
  await expect(boardCard).toBeVisible();
  await boardCard.click();
  const card = page.getByRole('dialog').filter({ hasText: title });
  await expect(card.getByRole('button', { name: 'Начать' })).toBeVisible();

  // Чек-лист: ответ сервера — пункт, карточка не ломается (баг #311).
  await card.getByRole('button', { name: 'Добавить пункт' }).click();
  await page.keyboard.type('Собрать исходные данные');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(card.getByText('Собрать исходные данные')).toBeVisible();

  // Подзадача строкой в списке.
  await card.getByRole('button', { name: 'Добавить подзадачу' }).click();
  await page.keyboard.type(`Подзадача ${stamp}`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(card.getByText(`Подзадача ${stamp}`)).toBeVisible();

  await card.getByRole('button', { name: 'Начать' }).click();
  await expect(card.getByLabel('Стадия')).toContainText('В работе');

  // Ручное время за сегодня.
  await card.getByRole('button', { name: 'Учёт времени' }).click();
  await page.getByLabel('Внести время').fill('30м');
  await page.getByRole('button', { name: 'Внести время' }).click();
  await expect(page.getByText('Время внесено')).toBeVisible();
  await page.keyboard.press('Escape');

  // Гейт «нет открытых подзадач» → диалог → закрыть вместе с подзадачами.
  await card.getByRole('button', { name: 'Завершить' }).click();
  await page.getByRole('button', { name: /Завершить вместе с подзадачами/ }).click();
  await expect(page.getByText('Подзадачи завершены')).toBeVisible();
  await expect(card.getByLabel('Стадия')).toContainText('Завершена');
  await expect(card.getByRole('button', { name: 'Вернуть в работу' })).toBeVisible();
});
