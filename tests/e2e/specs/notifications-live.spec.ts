import { expect, test } from '@playwright/test';

/**
 * Живые e2e уведомлений #100 (Ф5, чек-лист E/H): песочница live-stack
 * (:4173, изолированная БД nodus_night, Redis db1). Запуск:
 * E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173
 * Пробные пользователи: night-a@nodus.local (Анна) / night-b@nodus.local
 * (Борис), пароль Night-Probe-100! (канон песочницы: свои юзеры Prisma).
 * SPA-навигация без reload (сессия короткая — память live-stack).
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const EMAIL = process.env.E2E_USER_EMAIL ?? 'night-b@nodus.local';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Night-Probe-100!';

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

test.describe('уведомления: живой контур (#100)', () => {
  test('E2: Главная-лента — секции внимания/фона, пилюли, пустое состояние после разбора', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Рабочая почта').fill(EMAIL);
    await page.getByLabel('Пароль').fill(PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);

    // Лента журнала (после живых проб есть строки) + строка поиска.
    await expect(page.getByLabel('Поиск…')).toBeVisible();
    // Заголовок ленты (NodeLabel UPPERCASE) ИЛИ пустое состояние — оба валидны
    // в зависимости от остатков проб; главная метка — каркас ленты.
    const attention = page.getByText('УВЕДОМЛЕНИЯ').first();
    const clean = page.getByText('Всё разобрано').first();
    await expect(attention.or(clean)).toBeVisible();

    // Колокольчик в топбаре с живым поповером (массового прочтения нет —
    // фидбек 01.10; список/заглушка).
    await page.getByRole('button', { name: 'Уведомления' }).click();
    await expect(page.getByText('Последние уведомления')).toBeVisible();
    const someRow = page.getByRole('button', { name: /·/ }).first();
    const bellEmpty = page.getByText('Новых уведомлений нет').first();
    await expect(someRow.or(bellEmpty)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('H1-браузер: живой тост личного при упоминании (вкладка вне чата)', async ({
    page,
    request,
  }) => {
    // Логин night-b; упоминание шлёт night-a через живой API.
    await page.goto('/');
    await page.getByLabel('Рабочая почта').fill(EMAIL);
    await page.getByLabel('Пароль').fill(PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/home$/);

    const login = await request.post('/api/v1/auth/login', {
      data: { email: 'night-a@nodus.local', password: 'Night-Probe-100!' },
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    // Беседа a→b: получатель night-b (id из логина получателя, не отправителя).
    const loginB = await request.post('/api/v1/auth/login', {
      data: { email: EMAIL, password: PASSWORD },
    });
    const tokenB = ((await loginB.json()) as { accessToken: string }).accessToken;
    const meB = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bId = ((await meB.json()) as { id: string }).id;
    const direct = await request.get(`/api/v1/chat/conversations/direct/${bId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const convId = ((await direct.json()) as { id: string }).id;
    const stamp = `toast-${Date.now()}`;
    await request.post(`/api/v1/chat/conversations/${convId}/messages`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': `e2e-${stamp}` },
      data: { text: `Прямое сообщение для тоста ${stamp}` },
    });

    // Тост личного (aria-live контейнер) появляется без F5.
    // Тост живого личного: в aria-live контейнере виден превью-текст сообщения.
    await expect(page.locator('[aria-live="polite"]').getByText(stamp)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('H4: обрыв gateway → reconnect с догрузкой без потерь', async ({ page, request }) => {
    test.skip(true, 'Рестарт gateway процесса — проверяется отдельным скриптом ночи (kill+up)');
    void page;
    void request;
  });
});
