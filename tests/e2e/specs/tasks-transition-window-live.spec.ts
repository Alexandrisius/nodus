import { expect, test, type Page } from '@playwright/test';
import { ADMIN, NIGHT_A } from '../e2e-users.js';

/**
 * Живой e2e «Окно перехода» (#380) — критичный путь закрытия задачи:
 * 1) админ включает у «Завершить» раздел «Файлы итога, минимум 1» и публикует;
 * 2) исполнитель жмёт «Завершить» — открывается окно;
 * 3) выбирает файл из чата задачи;
 * 4) «Завершить» → задача «На утверждении»;
 * 5) постановщик в окне «Утвердить» видит блок «Что сдаёт исполнитель» с файлом;
 * плюс «Приостановить» требует причину, причина видна блоком в чате.
 *
 * Запуск в песочнице live-stack:
 * E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173 npx playwright test specs/tasks-transition-window-live.spec.ts
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const BASE = process.env.NODUS_BASE_URL ?? 'http://127.0.0.1:4173';
const API = `${BASE}/api/v1`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Рабочая почта').fill(user.email);
  await page.getByLabel('Пароль').fill(user.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** JSON-вызов API из сессии страницы (cookie-auth). */
async function api<T>(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await page.request.fetch(`${API}${path}`, {
    method,
    data: data as never,
    headers: { 'content-type': 'application/json' },
  });
  expect(response.status(), `${method} ${path} → ${response.status()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

test.describe('окно перехода (#380)', () => {
  test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку');

  test('акт из чата: окно «Завершить» → утверждение видит сдачу', async ({ browser }) => {
    test.setTimeout(180_000);
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, ADMIN);

    // 1. Окно у «Завершить»: файлы итога, минимум 1 (публикация через API —
    //    та же доменная публикация, что кнопка «Опубликовать» редактора).
    const types = await api<{ items: { code: string | null; workflowId: string }[] }>(
      adminPage,
      'GET',
      '/workflows/types',
    );
    const standard = types.items.find((t) => t.code === 'task')!;
    const detail = await api<{
      version: number;
      document: {
        stages: unknown[];
        transitions: { name: string; form?: unknown }[];
        layout?: unknown;
      };
    }>(adminPage, 'GET', `/workflows/${standard.workflowId}`);
    const document = {
      ...detail.document,
      transitions: detail.document.transitions.map((t) =>
        t.name === 'Завершить'
          ? {
              ...t,
              form: {
                enabled: true,
                sections: [
                  { kind: 'result' },
                  { kind: 'result_files', label: 'Акт выполненных работ' },
                ],
              },
            }
          : t,
      ),
    };
    await api(adminPage, 'POST', `/workflows/${standard.workflowId}/publish`, {
      baseVersion: detail.version,
      document,
      migrations: [],
    });

    // 2. Задача постановщика (админ) на исполнителя NIGHT_A.
    const people = await api<{ items: { id: string; email: string }[] }>(
      adminPage,
      'GET',
      `/directory/users?status=active&search=${encodeURIComponent(NIGHT_A.email)}`,
    );
    const executor = people.items[0]!;
    const title = `E2E окно ${Date.now() % 100000}`;
    const task = await api<{ id: string }>(adminPage, 'POST', '/tasks', {
      title,
      assigneeId: executor.id,
    });
    const chat = await api<{ id: string }>(
      adminPage,
      'GET',
      `/chat/conversations/by-task/${task.id}`,
    );

    // 3. «Акт» уже в чате задачи: загрузка + сообщение (файлы задачи — вложения
    //    её чата, канон #252).
    const upload = await adminPage.request.post(`${API}/chat/attachments`, {
      multipart: {
        size: String(PNG.length),
        file: { name: 'akt.png', mimeType: 'image/png', buffer: PNG },
      },
    });
    expect(upload.status()).toBe(201);
    const attachment = (await upload.json()) as { id: string };
    await api(adminPage, 'POST', `/chat/conversations/${chat.id}/messages`, {
      text: 'Акт выполненных работ',
      attachmentIds: [attachment.id],
    });

    // 4. Исполнитель: карточка → «Завершить» открывает ОКНО (не диалог отказа).
    const executorContext = await browser.newContext();
    const executorPage = await executorContext.newPage();
    await login(executorPage, NIGHT_A);
    await executorPage.goto('/tasks');
    await executorPage.getByText(title).first().click();
    const card = executorPage.getByRole('dialog').filter({ hasText: title });
    await expect(card.getByRole('button', { name: 'Взять в работу' })).toBeVisible();
    await card.getByRole('button', { name: 'Взять в работу' }).click();
    await card.getByRole('button', { name: 'Завершить' }).click();

    const window = executorPage.getByRole('dialog').filter({ hasText: 'Завершить' });
    await expect(window.getByText('Файлы итога')).toBeVisible();
    await window.getByRole('button', { name: 'Выбрать из чата задачи' }).click();
    await window.getByRole('button', { name: /akt\.png/ }).click();
    await window.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(executorPage.getByText('На утверждении').first()).toBeVisible({
      timeout: 20_000,
    });

    // 5. Постановщик: «Утвердить» → блок «Что сдаёт исполнитель» с актом.
    await adminPage.goto('/tasks');
    await adminPage.getByText(title).first().click();
    const adminCard = adminPage.getByRole('dialog').filter({ hasText: title });
    await adminCard.getByRole('button', { name: 'Утвердить' }).click();
    const approve = adminPage.getByRole('dialog').filter({ hasText: 'Утвердить' });
    await expect(approve.getByText('Что сдаёт исполнитель')).toBeVisible();
    await expect(approve.getByText('akt.png')).toBeVisible();

    await adminContext.close();
    await executorContext.close();
  });

  test('«Приостановить» требует причину, причина видна блоком в чате', async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, NIGHT_A);
    const title = `E2E пауза ${Date.now() % 100000}`;
    const task = await api<{ id: string }>(page, 'POST', '/tasks', {
      title,
      assigneeId: (await api<{ id: string }>(page, 'GET', '/directory/me')).id,
    });
    await page.goto('/tasks');
    await page.getByText(title).first().click();
    const card = page.getByRole('dialog').filter({ hasText: title });
    await card.getByRole('button', { name: 'Взять в работу' }).click();
    await card.getByRole('button', { name: 'Приостановить' }).click();
    const window = page.getByRole('dialog').filter({ hasText: 'Приостановить' });
    const submit = window.getByRole('button', { name: 'Приостановить', exact: true });
    await expect(submit).toBeDisabled();
    await window.getByLabel('Причина приостановки').fill('Ждём согласование заказчика');
    await submit.click();
    await expect(page.getByText('Приостановлена').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Ждём согласование заказчика').first()).toBeVisible({
      timeout: 20_000,
    });
    expect(task.id).toBeTruthy();
    await context.close();
  });
});
