import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Разовые скриншоты ревизии #212: автолинк-гипертекст в пузыре + карточка
 * превью ПОД текстом, обе темы, обе стороны (night-a — чужие пузыри,
 * night-b — свои синие со ссылкой).
 *   NODUS_BASE_URL=http://127.0.0.1:4173 node tests/e2e/linkfix-shots.mjs
 */
const base = (process.env.NODUS_BASE_URL ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
// От корня репо (не от cwd запуска): live-stack-каталог канонический
const out = fileURLToPath(new URL('../../.live-stack/shots/212-fix/', import.meta.url));
mkdirSync(out, { recursive: true });

const PEER_NAME = 'Борис Ночной';
const ANNA = 'Анна Ночная';

async function shoot(browser, { user, peer, tag }) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
    });
    await ctx.addInitScript(
      `localStorage.setItem('nodus-shell-v1', JSON.stringify({ state: { theme: ${JSON.stringify(theme)}, edgeOpen: false }, version: 1 }));`,
    );
    const page = await ctx.newPage();
    await page.goto(`${base}/`);
    await page.waitForTimeout(600);
    console.log('after goto:', page.url());
    await page.getByLabel('Рабочая почта').fill(user.email);
    await page.getByLabel('Пароль').fill(user.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/(home)?$/, { timeout: 15000 });
    await page.waitForTimeout(1200);
    console.log('after login:', page.url());

    await page.goto(`${base}/chat`);
    await page.waitForTimeout(1500);
    console.log('chat url:', page.url());
    await page
      .getByRole('button', { name: new RegExp(peer) })
      .first()
      .click();
    await page.waitForTimeout(2000);
    console.log('after conv click:', page.url());

    const bubbles = page.locator('[data-slot="bubble-content"]:has(a[target="_blank"])');
    await bubbles.first().waitFor({ timeout: 10000 });
    // Кропы каждого пузыря со ссылкой (текст + карточка целиком), снизу вверх
    const count = await bubbles.count();
    for (let i = 0; i < count; i += 1) {
      await bubbles
        .nth(count - 1 - i)
        .screenshot({ path: `${out}/${tag}__${theme}__bubble${i}.png` });
    }
    await page.screenshot({ path: `${out}/${tag}__${theme}__page.png` });
    // Кликабельность ссылки: якорь в тексте существует и ведёт наружу
    const link = page.locator('[data-slot="bubble-content"] a[target="_blank"]').first();
    const href = await link.getAttribute('href');
    console.log(`${tag} ${theme}: link href = ${href}`);
    await ctx.close();
  }
}

const browser = await chromium.launch();
await shoot(browser, {
  user: { email: 'night-a@nodus.local', password: 'Night-Probe-100!' },
  peer: PEER_NAME,
  tag: 'a-view',
});
await shoot(browser, {
  user: { email: 'night-b@nodus.local', password: 'Night-Probe-100!' },
  peer: ANNA,
  tag: 'b-own',
});
await browser.close();
console.log('DONE');
