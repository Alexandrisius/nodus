import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Разовые скриншоты кнопки отправки SendHexButton (полный знак Nodus):
 * зум глифа + композер целиком, обе темы.
 *   NODUS_BASE_URL=http://localhost:5173 node tests/e2e/sendhex-shots.mjs
 */
const base = (process.env.NODUS_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const out = 'tests/e2e/shots-sendhex';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 3,
  });
  await ctx.addInitScript(
    `localStorage.setItem('nodus-shell-v1', JSON.stringify({ state: { theme: ${JSON.stringify(theme)}, edgeOpen: false }, version: 1 }));`,
  );
  const page = await ctx.newPage();

  await page.goto(`${base}/`);
  if (page.url().includes('/login')) {
    await page.waitForTimeout(600);
    await page.getByLabel('Рабочая почта').fill('demo@passatproekt.by');
    await page.getByLabel('Пароль').fill('demo');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/(home)?$/);
  }
  await page.waitForTimeout(1200);

  await page.goto(`${base}/chat`);
  await page.waitForTimeout(1200);
  await page.locator('[data-no-scrollbar] button').first().click();
  await page.waitForTimeout(1400);

  // Кнопка отправки: зум глифа (deviceScaleFactor 3 → чёткие пиксели)
  const send = page.locator('form button[type="submit"]').last();
  await send.screenshot({ path: `${out}/send-glyph__${theme}.png` });

  // Композер целиком
  await page
    .locator('form')
    .last()
    .screenshot({ path: `${out}/composer__${theme}.png` });

  // Активное состояние (текст в поле → кнопка в primary-тоне)
  await page.locator('form textarea').last().fill('Тестовое сообщение');
  await page.waitForTimeout(400);
  await send.screenshot({ path: `${out}/send-glyph-active__${theme}.png` });

  console.log(`${theme}: ok`);
  await ctx.close();
}

await browser.close();
