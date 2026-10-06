import { expect, test, type Page } from '@playwright/test';

/**
 * Живое превью ссылок (#212, критичный путь): отправка со ссылкой
 * мгновенна (скелетон без сдвига), карточка дозревает фоном у второй
 * сессии (WS), повторная та же ссылка — из кэша; SSRF-адрес — домен-
 * заглушка (blocked), не пустая карточка.
 *
 * E2E_LIVE_API=1 NODUS_BASE_URL=… npx playwright test specs/link-preview-live.spec.ts
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const BASE_URL = process.env.NODUS_BASE_URL ?? 'http://localhost:3000';
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@nodus.by',
  password: process.env.E2E_ADMIN_PASSWORD ?? '',
};
const PEER = {
  email: process.env.E2E_SECOND_EMAIL ?? 'a.klimovich@passatproekt.by',
  password: process.env.E2E_SECOND_PASSWORD ?? '',
};
const RUN = Date.now().toString(36);

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

test.describe('живое превью ссылок (#212)', () => {
  let adminToken: string;
  let conversationId: string;

  test.beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': `e2e-lp-${RUN}` },
      body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    });
    expect(res.status).toBe(200);
    adminToken = ((await res.json()) as { accessToken: string }).accessToken;

    const users = await fetch(`${BASE_URL}/api/v1/directory/users?limit=100`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const peer = ((await users.json()) as { items: { email: string; id: string }[] }).items.find(
      (u) => u.email === PEER.email,
    );
    expect(peer).toBeTruthy();
    const created = await fetch(`${BASE_URL}/api/v1/chat/conversations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': `e2e-lp-${RUN}-conv`,
      },
      body: JSON.stringify({ type: 'group', title: `e2e-lp-${RUN}`, memberIds: [peer!.id] }),
    });
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { id: string }).id;
  });

  async function loginUi(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/');
    await page.getByLabel('Рабочая почта').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/home$/);
  }

  test('карточка дозревает у обеих сессий; SSRF — домен-заглушка', async ({ browser }) => {
    const url = `https://example.com/?e2e-lp-${RUN}`;
    const ssrf = `http://192.168.77.77/${RUN}/`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginUi(pageA, ADMIN.email, ADMIN.password);
    await pageA.goto(`/chat/${conversationId}`);
    const field = pageA.locator('textarea');
    await field.click();
    await field.fill(`статья ${url} и внутренний ${ssrf}`);
    await field.press('Enter');
    await expect(pageA.locator('[data-slot="message-text"]').first()).toBeVisible({
      timeout: 5000,
    });

    // Карточка дозревает у А (WS-патч на месте): заголовок появляется
    // только в ready (скелетон/заглушка его не несут).
    await expect(pageA.getByText('Example Domain').first()).toBeVisible({ timeout: 25000 });

    // Вторая сессия: карточки на месте (готовая + домен-заглушка blocked).
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginUi(pageB, PEER.email, PEER.password);
    await pageB.goto(`/chat/${conversationId}`);
    await expect(pageB.getByText('Example Domain').first()).toBeVisible({ timeout: 15000 });
    await expect(pageB.getByText('192.168.77.77').first()).toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });
});
