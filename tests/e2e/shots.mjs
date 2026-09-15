import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Скриншоты каркаса для UI-чекпоинтов (НЕ тест, в suites не входит):
 * логин демо-кредами при необходимости (MSW-мок принимает любые) и съёмка
 * ключевых маршрутов. Главная — на трёх ширинах (DoD #4: порты на осях).
 *   NODUS_BASE_URL=http://localhost:5173 node shots.mjs [outDir]
 */
const base = (process.env.NODUS_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });

const routes = [
  ['tasks', '/tasks'],
  ['letters', '/letters'],
  ['projects', '/projects'],
  ['chat', '/chat'],
  ['employees', '/employees'],
];
const widths = [1280, 1600, 1920];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${base}/`);
if (page.url().includes('/login')) {
  await page.getByLabel('Рабочая почта').fill('demo@passatproekt.by');
  await page.getByLabel('Пароль').fill('demo');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/$/);
}

// Главная на трёх ширинах + ридер-слайдер с док-ребром
for (const width of widths) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/home-${width}.png` });
  console.log('shot home', width);
}
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto(`${base}/`);
await page.waitForTimeout(800);
await page.locator('article button').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/home-reader.png` });
console.log('shot home-reader');
await page.keyboard.press('Escape');

for (const [name, path] of routes) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
