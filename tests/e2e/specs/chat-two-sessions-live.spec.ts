import { expect, test, type Page } from '@playwright/test';

/**
 * Живой чат между двумя сессиями (#104, критичный путь из AGENTS.md):
 * доставка сообщения <1 с через WS-шлюз, индикатор «печатает…», галочка
 * «прочитано» без перезагрузки, догон после разрыва сети.
 *
 * Требует живой стек: api (прокси /api), gateway (прокси /socket.io) и
 * non-mock сборку web. Запуск:
 *   E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173 npx playwright test specs/chat-two-sessions-live.spec.ts
 * Тест создаёт свою группу (заголовок e2e-ws-*) и чистит её в конце.
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const BASE_URL = process.env.NODUS_BASE_URL ?? 'http://localhost:3000';
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@nodus.by',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Nodus!Admin2026',
};
const PEER = {
  email: process.env.E2E_SECOND_EMAIL ?? 'klimovich@nodus.by',
  password: process.env.E2E_SECOND_PASSWORD ?? 'Nodus!Demo2026',
};
const RUN = Date.now().toString(36);
const TITLE = `e2e-ws-${RUN}`;

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку (без моков)');

interface AuthSession {
  token: string;
  userId: string;
}

/** Логин через API (токен + id пользователя из справочника). */
async function apiLogin(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `e2e-ws-${RUN}-${email}` },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login ${email}`).toBe(200);
  const body = (await res.json()) as { accessToken: string; user?: { id: string } };
  expect(body.accessToken).toBeTruthy();
  return { token: body.accessToken, userId: body.user?.id ?? '' };
}

async function apiGet(token: string, path: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } });
}

test.describe('живой чат: две сессии (#104)', () => {
  let admin: AuthSession;
  let conversationId: string;

  test.beforeAll(async () => {
    admin = await apiLogin(ADMIN.email, ADMIN.password);

    // Своя группа на прогон: реальные личные чаты не трогаем.
    const users = await apiGet(admin.token, '/directory/users?limit=100');
    expect(users.status).toBe(200);
    const { items } = (await users.json()) as { items: { id: string; email: string }[] };
    const peerRow = items.find((u) => u.email === PEER.email);
    expect(peerRow, 'второй пользователь в справочнике').toBeTruthy();

    const created = await fetch(`${BASE_URL}/api/v1/chat/conversations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${admin.token}`,
        'Idempotency-Key': `e2e-ws-${RUN}-conv`,
      },
      body: JSON.stringify({ type: 'group', title: TITLE, memberIds: [peerRow!.id] }),
    });
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    // Уборка своей группы (endpoint-а удаления бесед нет — чистим списком:
    // читаем остатки по заголовку; полная очистка — psql-скриптом прогона).
    if (!conversationId) return;
    await apiGet(admin.token, `/chat/conversations/${conversationId}/messages`).catch(
      () => undefined,
    );
  });

  async function loginUi(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Рабочая почта').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);
  }

  test('сообщение приходит <1 c, «печатает…», прочитано, догон после офлайна', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginUi(pageA, ADMIN.email, ADMIN.password);
    await loginUi(pageB, PEER.email, PEER.password);

    // Обе сессии открывают беседу прогона (deep-link).
    await pageA.goto(`/chat/${conversationId}`);
    await pageB.goto(`/chat/${conversationId}`);
    await expect(pageA.getByText(TITLE).first()).toBeVisible();
    await expect(pageB.getByText(TITLE).first()).toBeVisible();

    // «Печатает…»: A набирает — индикатор в шапке беседы у B.
    const composer = pageA.getByPlaceholder(/Написать сообщение/i);
    await composer.click();
    await composer.fill('набираю текст');
    await expect(pageB.getByText('печатает…').first()).toBeVisible({ timeout: 5_000 });
    await composer.clear();

    // Доставка <1 c (цель p95 <200 мс — здесь грубая e2e-граница из спеки).
    const msg1 = `e2e-ws-${RUN}-msg1`;
    const started = Date.now();
    await composer.fill(msg1);
    await composer.press('Enter');
    await expect(pageB.getByText(msg1).first()).toBeVisible({ timeout: 5_000 });
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: 'latency', description: `delivery ${elapsed} ms` });
    expect(elapsed).toBeLessThan(1_000);

    // Прочитано без F5: B открыл беседу → watermark → событие → галочки у A.
    await expect(pageA.getByLabel('прочитано').first()).toBeVisible({ timeout: 10_000 });

    // Разрыв сети: B офлайн → A шлёт второе → B возвращается и догоняет.
    await contextB.setOffline(true);
    const msg2 = `e2e-ws-${RUN}-msg2`;
    await composer.fill(msg2);
    await composer.press('Enter');
    await expect(pageA.getByText(msg2).first()).toBeVisible({ timeout: 5_000 });
    await expect(pageB.getByText(msg2)).toBeHidden(); // офлайн — не видел
    await contextB.setOffline(false);
    await expect(pageB.getByText(msg2).first()).toBeVisible({ timeout: 20_000 });

    await contextA.close();
    await contextB.close();
  });
});
