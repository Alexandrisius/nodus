/** Одноразовая функциональная проверка стикеров #143 на мок-превью (:4174):
 *  логин (мок) → чат BIM-команда → демо-стикер в ленте → поповер пака →
 *  «Добавить пак» → панель пикера (вкладки) → отправка стикера → создание
 *  пака. Скриншоты в tests/e2e/shots-stickers/ для UI-чекпоинта владельца.
 *  Запуск из tests/e2e: node sticker-shots.mjs [base] */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4174';
const OUT = new URL('./shots-stickers/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, OUT));

const results = [];
function ok(name, cond) {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) process.exitCode = 1;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await context.newPage();

// Мок-режим: /auth/me всегда 200 (демо-актёр) — приложение сразу «в системе».
await page.goto(`${BASE}/chat`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);
await page.getByText('BIM-команда').first().click();
await page.waitForTimeout(600);

// 1. Демо-стикер в ленте (сообщение 33 из пака «Кадры»).
const stickerImg = page.locator('img[src*="/reactions/eyes.webp"]').first();
ok('демо-стикер в ленте', (await stickerImg.count()) > 0);
await page.screenshot({ path: shot('01-feed-sticker-light.png'), fullPage: false });

// 2. Клик по стикеру → поповер пака + «Добавить пак».
await stickerImg.click();
const addPack = page.getByRole('button', { name: 'Добавить пак' });
await addPack.waitFor({ timeout: 5_000 });
ok('поповер пака с кнопкой «Добавить пак»', await addPack.isVisible());
await page.screenshot({ path: shot('02-pack-popover.png') });

// 3. Установка пака → кнопка меняется на «Убрать из моих».
await addPack.click();
await page.getByRole('button', { name: 'Убрать из моих' }).waitFor({ timeout: 5_000 });
ok('пак добавился (кнопка сменилась)', true);
await page.keyboard.press('Escape');

// 4. Панель пикера: вкладки + стикер-вкладка с паками.
await page.getByRole('button', { name: 'Эмодзи' }).first().click();
await page.getByRole('tab', { name: 'Стикеры' }).waitFor({ timeout: 5_000 });
await page.getByRole('tab', { name: 'Стикеры' }).click();
await page.locator('img[src*="/stickers/demo/rocket.png"]').first().waitFor({ timeout: 5_000 });
ok('вкладка стикеров: демо-пак Nodus загрузился', true);
await page.screenshot({ path: shot('03-sticker-panel.png') });

// 5. Отправка стикера из панели — новое стикер-сообщение в ленте.
const before = await page.locator('img[src*="/stickers/demo/rocket.png"]').count();
await page
  .getByRole('button', { name: /Nodus: 🚀/ })
  .first()
  .click();
await page.waitForTimeout(800);
const after = await page.locator('img[src*="/stickers/demo/rocket.png"]').count();
ok('отправка стикера кликом (сообщение появилось)', after > before);
await page.screenshot({ path: shot('04-sent-sticker.png') });

// 6. Диалог создания пака.
await page.getByRole('button', { name: 'Создать пак' }).first().click();
await page.getByLabel('Название пака').waitFor({ timeout: 5_000 });
ok('диалог создания пака открылся', true);
await page.screenshot({ path: shot('05-create-dialog.png') });
await page.keyboard.press('Escape');

// 7. Тёмная тема: лента со стикером.
await page.evaluate(() => {
  localStorage.setItem('nodus-shell-v1', JSON.stringify({ theme: 'dark' }));
});
await page.reload();
await page.waitForLoadState('networkidle');
await page.getByText('BIM-команда').first().click();
await page.waitForTimeout(600);
ok(
  'тёмная тема: стикер в ленте',
  (await page.locator('img[src*="/reactions/eyes.webp"]').count()) > 0,
);
await page.screenshot({ path: shot('06-feed-sticker-dark.png') });

await browser.close();
console.log(results.join('\n'));
