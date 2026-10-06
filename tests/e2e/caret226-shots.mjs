import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Разовые скриншоты #228: пустое поле с ВИДИМОЙ нативной кареткой (баг 1),
 * чип-имя с подчёркиванием и набранным текстом сразу за ним (баг 2),
 * компактный поповер правки (фидбек 3). Обе темы.
 */
const base = 'http://127.0.0.1:4173';
const out = fileURLToPath(new URL('../../.live-stack/shots/228-fix/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(
    `localStorage.setItem('nodus-shell-v1', JSON.stringify({ state: { theme: ${JSON.stringify(theme)}, edgeOpen: false }, version: 1 }));`,
  );
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForTimeout(500);
  await page.getByLabel('Рабочая почта').fill('night-b@nodus.local');
  await page.getByLabel('Пароль').fill('Night-Probe-100!');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/home/);
  await page.waitForTimeout(900);
  await page.goto(base + '/chat');
  await page.waitForTimeout(1200);
  await page
    .getByRole('button', { name: /Анна Ночная/ })
    .first()
    .click();
  await page.waitForTimeout(1500);

  // Баг 1: пустое поле — каретка видна в начале (нативная, фокус кликом)
  const field = page.locator('textarea');
  await field.click();
  await page.waitForTimeout(300);
  const form = page.locator('form').first();
  await form.screenshot({ path: `${out}/empty-caret__${theme}.png` });

  // Баг 2: чип-имя (подчёркивание, без @) + набранный текст сразу за ним
  await field.pressSequentially('написал @ан', { delay: 30 });
  await page.waitForTimeout(400);
  await field.press('Enter');
  await page.waitForTimeout(250);
  await field.pressSequentially('проверь чертёж', { delay: 25 });
  await page.waitForTimeout(300);
  await form.screenshot({ path: `${out}/chip-typing__${theme}.png` });

  // Фидбек 3: компактный поповер (клик по подчёркнутому имени)
  const chip = page.locator('div[aria-hidden] span.underline').first();
  await chip.click({ force: true });
  // клик по чипу в зеркале не двигает каретку поля — щёлкаем по полю в зоне чипа
  const box = await chip.boundingBox();
  if (box) {
    await field.click({
      position: { x: box.x - (await field.boundingBox()).x + box.width / 2, y: 10 },
    });
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/popover__${theme}.png` });
  await ctx.close();
}
await browser.close();
console.log('DONE');
