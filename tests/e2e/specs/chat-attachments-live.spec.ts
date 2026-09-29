import { expect, test, type Page } from '@playwright/test';

/**
 * Живые вложения чата (#57, приёмка: upload → send → download на реальном
 * MinIO): загрузка картинки через композер (скрепка → скрытый input) открывает
 * ОКНО ОТПРАВКИ (#144): строка с прогрессом/крестиком, подпись внутри окна,
 * отправка его кнопкой; картинка видна ОБЕИМ сессиям (WS-доставка DTO с
 * подписанным url), а <img> РЕАЛЬНО грузит контент без auth-заголовка;
 * контрольное скачивание через API — байт-в-байт.
 *
 * Требует живой стек: api (прокси /api), MinIO и non-mock сборку web. Запуск:
 *   E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173 npx playwright test specs/chat-attachments-live.spec.ts
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
const TITLE = `e2e-att-${RUN}`;
const FILE_NAME = `e2e-att-${RUN}.png`;
const CAPTION = `e2e-att-${RUN}-подпись`;

/** 1×1 прозрачный PNG (валидные байты — MinIO примет, <img> отрендерит). */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку (без моков)');

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `e2e-att-${RUN}-${email}` },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login ${email}`).toBe(200);
  const body = (await res.json()) as { accessToken: string };
  expect(body.accessToken).toBeTruthy();
  return body.accessToken;
}

async function loginUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe('живые вложения чата (#57)', () => {
  let adminToken: string;
  let conversationId: string;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN.email, ADMIN.password);
    const users = await fetch(`${BASE_URL}/api/v1/directory/users?limit=100`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const { items } = (await users.json()) as { items: { id: string; email: string }[] };
    const peer = items.find((u) => u.email === PEER.email);
    expect(peer, 'второй пользователь в справочнике').toBeTruthy();

    const created = await fetch(`${BASE_URL}/api/v1/chat/conversations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': `e2e-att-${RUN}-conv`,
      },
      body: JSON.stringify({ type: 'group', title: TITLE, memberIds: [peer!.id] }),
    });
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { id: string }).id;
  });

  test('картинка: скрепка → окно отправки → отправка → обе сессии видят → контент байт-в-байт', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginUi(pageA, ADMIN.email, ADMIN.password);
    await loginUi(pageB, PEER.email, PEER.password);
    await pageA.goto(`/chat/${conversationId}`);
    await pageB.goto(`/chat/${conversationId}`);
    await expect(pageA.getByText(TITLE).first()).toBeVisible();

    // Скрепка → скрытый input «Фото или видео» (accept image/video).
    await pageA.setInputFiles('input[accept="image/*,video/*"]', {
      name: FILE_NAME,
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });

    // Окно отправки (#144): строка загрузки — крестик «Отменить загрузку»
    // (прогресс) или «Убрать из сообщения» (готово). Живой MinIO — щедрый
    // таймаут; «Отправить» окна заблокирована, пока загрузка не готова.
    const dialog = pageA.getByRole('dialog');
    const removeButton = pageA
      .getByRole('button', { name: 'Отменить загрузку' })
      .or(pageA.getByRole('button', { name: 'Убрать из сообщения' }));
    await expect(removeButton.first()).toBeVisible({ timeout: 15_000 });
    const sendButton = dialog.getByRole('button', { name: 'Отправить', exact: true });
    await expect(sendButton).toBeEnabled({ timeout: 20_000 });

    // Подпись — поле окна (текст черновика), отправка — кнопкой окна.
    await dialog.getByPlaceholder('Добавить подпись').fill(CAPTION);
    await sendButton.click();

    // У себя: подпись + галерея; <img> реально загрузил подписанный url
    // (naturalWidth > 0 — без auth-заголовка, только виза в query).
    await expect(pageA.getByText(CAPTION).first()).toBeVisible({ timeout: 10_000 });
    const tileA = pageA.locator(`img[alt="${FILE_NAME}"]`).first();
    await expect(tileA).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => tileA.evaluate((img) => (img as HTMLImageElement).naturalWidth), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // У второй сессии: доставка DTO по WS — та же картинка рендерится.
    const tileB = pageB.locator(`img[alt="${FILE_NAME}"]`).first();
    await expect(tileB).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => tileB.evaluate((img) => (img as HTMLImageElement).naturalWidth), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // Контрольное скачивание через API: url из сообщения — байты совпадают.
    const feed = await fetch(
      `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages?limit=50`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    );
    expect(feed.status).toBe(200);
    const { items } = (await feed.json()) as {
      items: { attachments: { url: string | null }[] }[];
    };
    const url = items.flatMap((m) => m.attachments).at(-1)?.url;
    expect(url, 'подписанный url в DTO').toMatch(/^\/api\/v1\/files\/.+\/content\?/);
    const download = await fetch(`${BASE_URL}${url}`);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).equals(PNG_BYTES)).toBe(true);

    await contextA.close();
    await contextB.close();
  });
});
