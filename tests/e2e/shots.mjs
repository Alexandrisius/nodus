import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Скриншоты каркаса для UI-чекпоинтов (НЕ тест, в suites не входит):
 * логин демо-кредами (MSW-мок принимает любые) и съёмка ключевых маршрутов.
 *   NODUS_BASE_URL=http://localhost:5173 node shots.mjs [outDir]
 * Базовый URL по умолчанию — vite dev :5173; outDir — относительно tests/e2e.
 */
const base = (process.env.NODUS_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });

const routes = [
  ['home', '/'],
  ['tasks', '/tasks'],
  ['letters', '/letters'],
  ['projects', '/projects'],
  ['chat', '/chat'],
  ['employees', '/employees'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${base}/`);
if (page.url().includes('/login')) {
  await page.getByLabel('Рабочая почта').fill('demo@passatproekt.by');
  await page.getByLabel('Пароль').fill('demo');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/$/);
}
for (const [name, path] of routes) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
