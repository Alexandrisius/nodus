import { expect, test, type Page } from '@playwright/test';

/** Нагрузочный UI-тест живого графа: ?stress=N строит предразмещённый граф
 * на N узлов; замеряем fps/p95 кадра за 5 секунд rAF-сэмплинга.
 * Пороги — для headless-рендера без GPU (SwiftShader); в реальном браузере
 * с аппаратным canvas цифры кратно выше. */

const DEV = process.env.NODUS_DEV_URL ?? 'http://localhost:5173';

test.describe.configure({ timeout: 90_000 });

async function ensureLoggedIn(page: Page) {
  await page.goto(DEV);
  await page.waitForTimeout(1000);
  if (page.url().includes('login')) {
    await page.getByRole('textbox').fill('demo@nodus.by');
    await page.locator('input[type="password"]').fill('demo-demo-123');
    await page.getByRole('button').click();
    await page.waitForTimeout(1200);
  }
}

async function measure(page: Page, nodes: number) {
  await page.goto(`${DEV}/?stress=${nodes}`);
  await page.waitForTimeout(3000);
  return page.evaluate(
    () =>
      new Promise<{ fps: number; p95: number }>((resolve) => {
        const frames: number[] = [];
        let last = performance.now();
        const loop = (t: number) => {
          frames.push(t - last);
          last = t;
          if (frames.length < 300) requestAnimationFrame(loop);
          else {
            frames.sort((x, y) => x - y);
            const avg = frames.reduce((s, f) => s + f, 0) / frames.length;
            resolve({
              fps: Math.round(1000 / avg),
              p95: Math.round(frames[Math.floor(frames.length * 0.95)] ?? 0),
            });
          }
        };
        requestAnimationFrame(loop);
      }),
  );
}

test('граф 10 000 узлов: fps >= 15', async ({ page }) => {
  await ensureLoggedIn(page);
  const stats = await measure(page, 10_000);
  console.log('stress 10k:', stats);
  expect(stats.fps).toBeGreaterThanOrEqual(15);
});

test('граф 100 000 узлов: fps >= 8 и скриншот', async ({ page }) => {
  await ensureLoggedIn(page);
  const stats = await measure(page, 100_000);
  console.log('stress 100k:', stats);
  expect(stats.fps).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: 'test-results/graph-stress-100k.png' });
});
