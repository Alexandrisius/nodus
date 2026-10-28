import { expect, test } from '@playwright/test';
import { NIGHT_A } from '../e2e-users.js';

/**
 * Живой e2e «создание задачи» (#311, критичный путь модуля задач): песочница
 * live-stack (:4173, БД nodus_night). Запуск:
 * E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173
 * Путь: экспресс-форма → карточка на «Моём плане» без перезагрузки →
 * чек-лист и подзадача в карточке → «Взять в работу» → внести время →
 * «Завершить» упирается в гейт подзадач (окно/диалог со списком) → удаление.
 * Кнопки «Завершить вместе с подзадачами» больше нет (решение владельца
 * 20.10.2026, #391): подзадачи закрываются своими маршрутами.
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const EMAIL = process.env.E2E_USER_EMAIL ?? NIGHT_A.email;
const PASSWORD = process.env.E2E_USER_PASSWORD ?? NIGHT_A.password;

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

test('задача: создание → работа → время → гейт подзадач (#311, #428)', async ({ page }) => {
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

  // Экспресс-форма: системный тип по умолчанию («Стандартный»), ответственный — я.
  await page.getByRole('button', { name: 'Создать', exact: true }).first().click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Тип задачи')).toContainText('Стандартный');
  await form.getByLabel('Название задачи').fill(title);
  await form.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Задача создана')).toBeVisible();

  // Карточка появляется на доске без перезагрузки (фидбек владельца 16.10).
  const boardCard = page.getByText(title).first();
  await expect(boardCard).toBeVisible();
  await boardCard.click();
  const card = page.getByRole('dialog').filter({ hasText: title });
  await expect(card.getByRole('button', { name: 'Взять в работу' })).toBeVisible();

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

  await card.getByRole('button', { name: 'Взять в работу' }).click();
  await expect(card.getByLabel('Стадия')).toContainText('В работе');

  // Ручное время за сегодня.
  await card.getByRole('button', { name: 'Учёт времени' }).click();
  await page.getByLabel('Внести время').fill('30м');
  await page.getByRole('button', { name: 'Внести время' }).click();
  await expect(page.getByText('Время внесено')).toBeVisible();
  await page.keyboard.press('Escape');

  // Гейт «нет открытых подзадач»: у типа с формой «Завершить» открывается ОКНО
  // перехода (#510). При ✗ условие называет проблему (#511), а не положительное
  // «Нет незавершённых подзадач»; закрытие — «Отмена» (клик мимо не закрывает).
  await card.getByRole('button', { name: 'Завершить' }).click();
  const transitionWindow = page.getByRole('dialog').filter({ hasText: 'Завершить' });
  await expect(transitionWindow.getByText('Есть незавершённые подзадачи')).toBeVisible();
  await expect(transitionWindow.getByText(`Подзадача ${stamp}`)).toBeVisible();
  await transitionWindow.getByRole('button', { name: 'Отмена' }).click();
  await expect(transitionWindow.getByRole('button', { name: 'Отмена' })).toHaveCount(0);

  // Удаление из меню «⋯» карточки (постановщик): карточка закрывается.
  await card.getByRole('button', { name: 'Действия задачи' }).click();
  await page.getByRole('menuitem', { name: 'Удалить задачу' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить задачу' }).click();
  await expect(page.getByText('Задача удалена')).toBeVisible();
  await expect(card).toHaveCount(0);
});
