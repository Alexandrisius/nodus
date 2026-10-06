import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Разовые скриншоты ревизии #224: чипы упоминаний — контраст по поверхностям
 * (свой цветной пузырь / чужой светлый / «Все»), композер с чипом и
 * кастомной кареткой сразу за чипом, центр уведомлений без сырого кода.
 *   NODUS_BASE_URL=http://127.0.0.1:4173 node tests/e2e/mention224-shots.mjs
 */
const base = (process.env.NODUS_BASE_URL ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const out = fileURLToPath(new URL('../../.live-stack/shots/224-fix/', import.meta.url));
mkdirSync(out, { recursive: true });

// Для Бориса личная беседа подписана именем собеседника — Анной
const PEER_DIRECT = 'Анна Ночная';
const GROUP = 'Приёмка 224';

async function login(page, email) {
  await page.goto(`${base}/`);
  await page.waitForTimeout(500);
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByLabel('Пароль').fill('Night-Probe-100!');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/home/);
  await page.waitForTimeout(900);
}

const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(
    `localStorage.setItem('nodus-shell-v1', JSON.stringify({ state: { theme: ${JSON.stringify(theme)}, edgeOpen: false }, version: 1 }));`,
  );
  const page = await ctx.newPage();
  await login(page, 'night-b@nodus.local');

  // Личная беседа: своё цветное сообщение с чипом + чужое светлое с чипом
  await page.goto(`${base}/chat`);
  await page.waitForTimeout(1200);
  await page
    .getByRole('button', { name: new RegExp(PEER_DIRECT) })
    .first()
    .click();
  await page.waitForTimeout(1600);
  const bubbles = page.locator('[data-slot="bubble-content"]:has([data-slot="mention-chip"])');
  await bubbles.first().waitFor({ timeout: 8000 });
  const count = await bubbles.count();
  for (let i = 0; i < count; i += 1) {
    await bubbles.nth(count - 1 - i).screenshot({ path: `${out}/direct__${theme}__chip${i}.png` });
  }

  // Группа «Приёмка 224»: чип «Все» (чужой пузырь для Бориса)
  await page
    .getByRole('button', { name: new RegExp(GROUP) })
    .first()
    .click();
  await page.waitForTimeout(1500);
  const all = page.locator('[data-slot="bubble-content"]:has-text("планёрка")');
  if ((await all.count()) > 0) {
    await all.last().screenshot({ path: `${out}/group-all__${theme}.png` });
  }

  // Композер: @бо → чип + кастомная каретка (два кадра: блинк)
  const field = page.locator('textarea');
  await field.click();
  await field.pressSequentially('написал @ан', { delay: 30 });
  await page.waitForTimeout(400);
  await page.locator('[role="option"]').first().waitFor({ timeout: 5000 });
  await field.press('Enter');
  await page.waitForTimeout(350);
  const form = page.locator('form').first();
  await form.screenshot({ path: `${out}/composer-chip__${theme}__a.png` });
  await page.waitForTimeout(400);
  await form.screenshot({ path: `${out}/composer-chip__${theme}__b.png` });

  // Центр уведомлений: свежие уведомления без сырого кода
  await page
    .getByRole('button', { name: /Уведомления/ })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/notifications__${theme}.png` });
  await ctx.close();
}

await browser.close();
console.log('DONE');
