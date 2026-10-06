import { expect, test, type Page } from '@playwright/test';

/**
 * Живое @упоминание-чип (#176, критичный путь «чат двух сессий» +
 * упоминание): автокомплит в композере вставляет токен-чип, отправка
 * доходит второй сессии с чипом, серверный снапшот mentionedUserIds
 * привязан по id (не по тексту); склонённый текст без токена НЕ
 * упоминает (критерий приёмки #176).
 *
 * Требует живой стек: E2E_LIVE_API=1 NODUS_BASE_URL=… npx playwright test
 * specs/chat-mention-live.spec.ts. Своя группа e2e-mention-* на прогон.
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
const TITLE = `e2e-mention-${RUN}`;

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

interface AuthSession {
  token: string;
  userId: string;
}

async function apiLogin(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `e2e-ment-${RUN}-${email}` },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login ${email}`).toBe(200);
  const body = (await res.json()) as { accessToken: string; user?: { id: string } };
  return { token: body.accessToken, userId: body.user?.id ?? '' };
}

test.describe('живое упоминание-чип (#176)', () => {
  let admin: AuthSession;
  let peer: AuthSession;
  let conversationId: string;
  let peerName: string;

  test.beforeAll(async () => {
    admin = await apiLogin(ADMIN.email, ADMIN.password);
    peer = await apiLogin(PEER.email, PEER.password);

    const users = await fetch(`${BASE_URL}/api/v1/directory/users?limit=100`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    const { items } = (await users.json()) as {
      items: { id: string; email: string; displayName: string }[];
    };
    const peerRow = items.find((u) => u.email === PEER.email);
    expect(peerRow, 'второй пользователь в справочнике').toBeTruthy();
    peerName = peerRow!.displayName;
    peer.userId = peerRow!.id;

    const created = await fetch(`${BASE_URL}/api/v1/chat/conversations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${admin.token}`,
        'Idempotency-Key': `e2e-ment-${RUN}-conv`,
      },
      body: JSON.stringify({ type: 'group', title: TITLE, memberIds: [peer.userId] }),
    });
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { id: string }).id;
  });

  async function loginUi(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Рабочая почта').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);
  }

  test('автокомплит → чип → чип у второй сессии, привязка по id', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginUi(pageA, ADMIN.email, ADMIN.password);
    await pageA.goto(`/chat/${conversationId}`);
    await pageA.waitForTimeout(1200);

    // Ввод «@» + первые буквы фамилии → панель кандидатов с peer.
    const field = pageA.locator('textarea');
    await field.click();
    const surnamePart = peerName.split(' ').slice(-1)[0]!.slice(0, 3);
    await field.pressSequentially(`@${surnamePart}`, { delay: 40 });
    const option = pageA.locator('[role="option"]', { hasText: peerName });
    await expect(option).toBeVisible({ timeout: 5000 });
    await field.press('Enter');

    // Чип в поле (оверлей): ВИДИМЫЙ текст — просто ФИО с подчёркиванием
    // (#228, dev-фидбек: без «@» и без заливки), каретка нативная.
    const chipInField = pageA.locator('div[aria-hidden] span.underline').first();
    await expect(chipInField).toHaveText(peerName);
    await field.pressSequentially('смотри', { delay: 30 });
    const adjacency = await pageA.evaluate(() => {
      const pill = document.querySelector<HTMLElement>('div[aria-hidden] span.underline');
      const mirror = pill?.closest('div[aria-hidden]');
      const after = mirror?.querySelector<HTMLElement>('span[style*="color-mix"] ~ span');
      void after;
      // правый край пилюли и левый край СЛОВА СРАЗУ ЗА ней: ищем текстовый
      // узел зеркала, начинающийся правее пилюли
      const pillRect = pill?.getBoundingClientRect();
      const walker = document.createTreeWalker(mirror!, NodeFilter.SHOW_TEXT);
      let wordLeft: number | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const r = document.createRange();
        r.selectNodeContents(n);
        const rect = r.getBoundingClientRect();
        if (pillRect && rect.left >= pillRect.right - 1 && rect.width > 0) {
          wordLeft = rect.left;
          break;
        }
      }
      return { pillRight: pillRect?.right ?? null, wordLeft };
    });
    expect(adjacency.pillRight).not.toBeNull();
    expect(adjacency.wordLeft).not.toBeNull();
    expect((adjacency.wordLeft ?? 0) - (adjacency.pillRight ?? 0)).toBeLessThan(24);
    await field.press('Enter'); // больше нет запроса — обычная отправка
    await pageA.waitForTimeout(400);

    // Серверный снапшот: упоминание по id, снапшот в DTO.
    const page1 = await fetch(
      `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages?limit=10`,
      { headers: { authorization: `Bearer ${admin.token}` } },
    );
    const sent = (
      (await page1.json()) as { items: { text: string; mentionedUserIds: string[] }[] }
    ).items.find((m) => m.text.includes(`(user:${peer.userId})`));
    expect(sent, 'токен улетел в тексте сообщения').toBeTruthy();
    expect(sent!.mentionedUserIds, 'упоминание привязано по id').toEqual([peer.userId]);

    // Вторая сессия: сообщение с чипом (кнопка-чип в ленте).
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginUi(pageB, PEER.email, PEER.password);
    await pageB.goto(`/chat/${conversationId}`);
    await expect(
      pageB.locator('[data-slot="message-text"] button', { hasText: peerName }).first(),
    ).toBeVisible({ timeout: 5000 });

    await contextA.close();
    await contextB.close();
  });

  test('склонённый текст без токена упоминанием НЕ является', async () => {
    const bare = `склонение ${peerName.split(' ')[0]}у без чипа ${RUN}`;
    const res = await fetch(`${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${admin.token}`,
        'Idempotency-Key': `e2e-ment-${RUN}-bare`,
      },
      body: JSON.stringify({ text: bare, attachmentIds: [] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { mentionedUserIds: string[] };
    expect(body.mentionedUserIds, 'без токена — пусто').toEqual([]);
  });

  test('#224 «Все»: первая строка автокомплита → чип → пинг обоим; Backspace атомарен', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginUi(page, ADMIN.email, ADMIN.password);
    await page.goto(`/chat/${conversationId}`);
    await page.waitForTimeout(1200);

    const field = page.locator('textarea');
    await field.click();
    await field.pressSequentially('@вс', { delay: 40 });
    // «Все» — закреплённая первая строка (Slack @channel)
    await expect(page.locator('[role="option"]').first()).toHaveText(/Все/);
    await field.press('Enter');

    // Чип «Все» в поле — ВИДИМЫЙ текст (#228) + отправка пересоберёт токен
    await expect(field).toHaveValue('Все ');
    await field.press('Enter');
    await page.waitForTimeout(400);

    // Снапшот: оба участника упомянуты (автор исключён)
    const page1 = await fetch(
      `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages?limit=5`,
      { headers: { authorization: `Bearer ${admin.token}` } },
    );
    const sent = (
      (await page1.json()) as { items: { text: string; mentionedUserIds: string[] }[] }
    ).items.find((m) => m.text.includes('(user:all)'));
    expect(sent, 'токен «Все» в тексте').toBeTruthy();
    expect(sent!.mentionedUserIds.sort()).toEqual([peer.userId].sort());

    // Чип «Все» в ленте у автора (нейтральный, без карточки — не человек)
    await expect(
      page.locator('[data-slot="message-text"] [data-slot="mention-chip"]', { hasText: 'Все' }),
    ).toBeVisible({ timeout: 5000 });

    // Backspace у чипа удаляет его ЦЕЛИКОМ (главный баг приёмки #224/#228):
    // снова вводим упоминание, каретка после видимого `@Все` — за пробелом.
    await field.click();
    await field.pressSequentially('@вс', { delay: 40 });
    await field.press('Enter'); // чип вставлен, каретка за пробелом (нативная)
    await expect(field).toHaveValue('Все ');
    await field.press('Backspace'); // пробел
    await expect(field).toHaveValue('Все');
    await field.press('Backspace'); // чип целиком (реестр) — поле пусто
    await expect(field).toHaveValue('');
    expect(await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(0);

    await context.close();
  });
});
