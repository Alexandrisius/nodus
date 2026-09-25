import { expect, test, type Page } from '@playwright/test';

/**
 * «Буря рефечей» → поступательная доставка (раунд 3, приёмка владельца):
 * 30 сообщений подряд появляются у получателя ПОСТУПАТЕЛЬНО (локальное
 * применение message_sent по seq), без шторма рефечей (замер по числу GET
 * ленты/списка за бурст — коалесцинг окон), удаление пачки 10 — <1 c.
 * Плюс мини-сценарий трэдов: точка «есть новые» на счётчике ответов поста
 * у наблюдателя и её гашение просмотром треда.
 *
 * Требует живой стек: E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173
 *   npx playwright test specs/chat-burst-live.spec.ts
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
const TITLE = `e2e-burst-${RUN}`;

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку (без моков)');

interface AuthSession {
  token: string;
  userId: string;
}

async function apiLogin(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `e2e-burst-${RUN}-${email}` },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login ${email}`).toBe(200);
  const body = (await res.json()) as { accessToken: string; user?: { id: string } };
  return { token: body.accessToken, userId: body.user?.id ?? '' };
}

async function apiGet(token: string, path: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } });
}

function apiPost(token: string, path: string, body: unknown, key: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

test.describe('живой чат: бурст 30 сообщений (раунд 3)', () => {
  let admin: AuthSession;
  let peer: AuthSession;
  let conversationId: string;
  let channelId: string;

  test.beforeAll(async () => {
    admin = await apiLogin(ADMIN.email, ADMIN.password);
    peer = await apiLogin(PEER.email, PEER.password);
    const users = await apiGet(admin.token, '/directory/users?limit=100');
    const { items } = (await users.json()) as { items: { id: string; email: string }[] };
    const peerRow = items.find((u) => u.email === PEER.email);
    expect(peerRow, 'второй пользователь в справочнике').toBeTruthy();

    const created = await apiPost(
      admin.token,
      '/chat/conversations',
      { type: 'group', title: TITLE, memberIds: [peerRow!.id] },
      `e2e-burst-${RUN}-conv`,
    );
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { id: string }).id;

    const channelRes = await apiPost(
      admin.token,
      '/chat/conversations',
      { type: 'project_channel', title: `Канал ${TITLE}`, memberIds: [peerRow!.id] },
      `e2e-burst-${RUN}-chan`,
    );
    expect(channelRes.status).toBe(201);
    channelId = ((await channelRes.json()) as { id: string }).id;
  });

  async function loginUi(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Рабочая почта').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);
  }

  test('30 сообщений подряд: поступательно, без шторма рефечей; удаление 10 <1 c', async ({
    browser,
  }) => {
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginUi(pageB, PEER.email, PEER.password);
    await pageB.goto(`/chat/${conversationId}`);
    await expect(pageB.getByText(TITLE).first()).toBeVisible();

    // Счётчики рефечей B ЗА период бурста (после успокоения открытия).
    const feedGet = /\/chat\/conversations\/[^/]+\/messages/;
    const listGet = /\/chat\/conversations\?/;
    let feedFetches = 0;
    let listFetches = 0;
    const onRequest = (req: import('@playwright/test').Request): void => {
      if (req.method() !== 'GET') return;
      const url = req.url();
      if (feedGet.test(url)) feedFetches += 1;
      if (listGet.test(url)) listFetches += 1;
    };
    pageB.on('request', onRequest);

    // Бурст: 30 сообщений подряд от A (REST — имитация «отправил и отправил»).
    const BURST = 30;
    for (let i = 1; i <= BURST; i += 1) {
      const res = await apiPost(
        admin.token,
        `/chat/conversations/${conversationId}/messages`,
        { text: `burst-${RUN}-${i}` },
        `burst-${RUN}-${i}`,
      );
      expect(res.status).toBe(201);
    }
    const lastSentAt = Date.now();

    // Последнее видно ≤1.5 c от конца бурста (поступательная доставка).
    // Локатор — ТОЧНЫЙ текст в ленте: substring-матч ловит превью списка
    // бесед и пузыри с метой времени («-21» внутри «-2117:46»).
    const feedViewportB = pageB.locator('[data-slot="message-scroller-viewport"]');
    await expect(feedViewportB.getByText(`burst-${RUN}-${BURST}`, { exact: true })).toBeVisible({
      timeout: 1_500,
    });
    const visibleIn = Date.now() - lastSentAt;
    test
      .info()
      .annotations.push({ type: 'latency', description: `burst tail visible ${visibleIn} ms` });

    // «Мерцания как перезагрузки» нет: лента за бурст рефетилась считанные
    // разы (локальное применение по seq; коалесцинг списка ~600 мс/окно).
    pageB.off('request', onRequest);
    test.info().annotations.push({
      type: 'refetches',
      description: `feed=${feedFetches} list=${listFetches} за бурст ${BURST}`,
    });
    expect(feedFetches, 'рефетчи ленты за бурст').toBeLessThanOrEqual(5);

    // Удаление пачки 10 — у B тексты пропадают <1 c (WS + коалесцинг).
    const list = await apiGet(admin.token, `/chat/conversations/${conversationId}/messages`);
    const { items } = (await list.json()) as { items: { id: string; text?: string }[] };
    const victims = items.filter((m) => (m.text ?? '').startsWith(`burst-${RUN}-`)).slice(-10);
    expect(victims).toHaveLength(10);
    const delStart = Date.now();
    for (const victim of victims) {
      const res = await fetch(
        `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages/${victim.id}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${admin.token}`,
            'Idempotency-Key': `burst-${RUN}-del-${victim.id}`,
          },
        },
      );
      expect(res.status).toBeLessThan(300);
      await res.text().catch(() => undefined); // дренируем тело ответа
    }
    await expect(feedViewportB.getByText(victims[0]!.text!, { exact: true })).toBeHidden({
      timeout: 1_000,
    });
    const delElapsed = Date.now() - delStart;
    test.info().annotations.push({
      type: 'latency',
      description: `delete burst 10 visible-in ${delElapsed} ms`,
    });
    expect(delElapsed).toBeLessThan(1_000);

    await contextB.close();
  });

  test('тред: точка «есть новые» у наблюдателя, просмотр треда гасит её', async ({ browser }) => {
    // Канал: A постит корень; B отвечает (становится наблюдателем); A шлёт
    // новый ответ — у B на счётчике ответов появляется точка (aria-подсказка);
    // B открывает тред — квитанция гасит точку.
    const post = await apiPost(
      admin.token,
      `/chat/conversations/${channelId}/messages`,
      { text: `post-${RUN}` },
      `thread-${RUN}-root`,
    );
    expect(post.status).toBe(201);
    const root = ((await post.json()) as { id: string }).id;
    const reply = await apiPost(
      peer.token,
      `/chat/conversations/${channelId}/messages`,
      { text: `reply-b-${RUN}`, threadRootId: root },
      `thread-${RUN}-reply-b`,
    );
    expect(reply.status).toBe(201);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginUi(pageB, PEER.email, PEER.password);
    await pageB.goto(`/chat/${channelId}`);
    await expect(pageB.getByText(`post-${RUN}`).first()).toBeVisible();
    // Открываем тред кликом «Обсудить» в карточке поста (текст поста есть и
    // в превью списка бесед — клик по нему только переходит в канал).
    await pageB.getByText('Обсудить', { exact: true }).first().click();
    await expect(pageB.getByText(`reply-b-${RUN}`, { exact: true }).first()).toBeVisible();
    // Закрытие треда: узкая зона — drill («К ленте»), широкая — X («Закрыть»).
    await pageB
      .getByRole('button', { name: /К ленте|Закрыть/ })
      .first()
      .click();

    // Новый чужой ответ — точка на счётчике ответов поста (B — наблюдатель).
    await apiPost(
      admin.token,
      `/chat/conversations/${channelId}/messages`,
      { text: `reply-a-${RUN}`, threadRootId: root },
      `thread-${RUN}-reply-a`,
    );
    await expect(pageB.getByLabel('Новые ответы').first()).toBeVisible({ timeout: 5_000 });

    // Просмотр треда гасит точку.
    await pageB.getByText('Обсудить', { exact: true }).first().click();
    await expect(pageB.getByText(`reply-a-${RUN}`, { exact: true }).first()).toBeVisible();
    await expect(pageB.getByLabel('Новые ответы').first()).toBeHidden({ timeout: 5_000 });

    await contextB.close();
  });
});
