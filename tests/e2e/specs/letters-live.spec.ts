import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, SECOND } from '../e2e-users.js';

/**
 * Живой e2e корреспонденции (#55, критичный путь «≤ 30 секунд»): канцелярия
 * (админ) регистрирует бумажное письмо в конвейере «Новые» — корреспондент,
 * их №, дата, тема, способ поступления, адресат, Ctrl+Enter — и получает
 * номер «Вх-ГГГГ/N». Сотрудник без `correspondence.register` не видит
 * «Новые» (вкладки нет), но видит зарегистрированное письмо во «Входящих».
 *
 * Требует живой стек без моков (api + web + MinIO):
 *   E2E_LIVE_API=1 NODUS_BASE_URL=http://127.0.0.1:4173 npx playwright test specs/letters-live.spec.ts
 */

const LIVE = Boolean(process.env.E2E_LIVE_API);
const BASE_URL = process.env.NODUS_BASE_URL ?? 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const COUNTERPARTY = `E2E Контрагент ${RUN}`;
const THEIR_NUMBER = `E2E-${RUN}`;
const SUBJECT = `E2E письмо ${RUN}`;

/** Валидный 1×1 PNG: скан бумаги, который реально открывается вьювером. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.skip(!LIVE, 'Пропущено: задай E2E_LIVE_API=1 и NODUS_BASE_URL на живую сборку (без моков)');

interface LetterDto {
  id: string;
  regNumber: string | null;
  subject: string | null;
}

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': `e2e-letter-${RUN}-${email}`,
    },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `login ${email}`).toBe(200);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function loginUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe('живая корреспонденция (#55)', () => {
  let adminToken: string;
  let letterId: string;
  let regNumber: string;

  test.beforeAll(async () => {
    adminToken = await apiLogin(ADMIN.email, ADMIN.password);
    const typesRes = await fetch(`${BASE_URL}/api/v1/workflows/types?category=letter`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(typesRes.status).toBe(200);
    const types = (await typesRes.json()) as { id: string; code: string }[];
    const incoming = types.find((type) => type.code === 'letter-incoming');
    expect(incoming, 'тип «Входящее письмо» в каталоге').toBeTruthy();

    const counterparty = await fetch(`${BASE_URL}/api/v1/counterparties`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': `e2e-letter-cp-${RUN}`,
      },
      body: JSON.stringify({ shortName: COUNTERPARTY, fullName: `ООО «${COUNTERPARTY}»` }),
    });
    expect(counterparty.status, await counterparty.clone().text()).toBe(201);

    const form = new FormData();
    form.append('typeId', incoming!.id);
    form.append('mainIndex', '0');
    form.append('files', new Blob([PNG_BYTES], { type: 'image/png' }), `e2e-${RUN}.png`);
    const created = await fetch(`${BASE_URL}/api/v1/letters`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'Idempotency-Key': `e2e-letter-${RUN}` },
      body: form,
    });
    expect(created.status, await created.clone().text()).toBe(201);
    letterId = ((await created.json()) as LetterDto).id;
  });

  test('канцелярия регистрирует письмо из конвейера «Новые»', async ({ page }) => {
    test.setTimeout(90_000);
    await loginUi(page, ADMIN.email, ADMIN.password);
    await page.goto('/letters?tab=new');

    const queue = page.getByRole('listbox', { name: 'Новые письма' });
    await expect(queue).toBeVisible();
    // Наше письмо — самое свежее (received_at DESC), поэтому первое.
    const first = queue.getByRole('option').first();
    await expect(first).toBeVisible();
    await first.click();

    // Корреспондент: ввод фильтрует справочник, выбор — кликом.
    await page.getByRole('combobox', { name: 'Корреспондент' }).click();
    await page.getByRole('combobox', { name: 'Корреспондент' }).fill(COUNTERPARTY);
    await page
      .getByRole('option', { name: new RegExp(COUNTERPARTY) })
      .first()
      .click();

    await page.getByLabel('Их №').fill(THEIR_NUMBER);
    await page.getByRole('textbox', { name: 'Их дата' }).fill('01.10.2026');
    await page.getByRole('textbox', { name: 'Тема', exact: true }).fill(SUBJECT);

    // Способ поступления — системный справочник; «Почта» засеяна миграцией.
    await page.getByRole('combobox', { name: 'Способ поступления' }).click();
    await page.getByRole('option', { name: 'Почта', exact: true }).click();

    await page.getByRole('combobox', { name: 'Адресат' }).click();
    // Список «Принимают решения» — держатели correspondence.resolve; админ
    // в сиде — «Системный Администратор».
    await page
      .getByRole('option', { name: /Администратор Системный/ })
      .first()
      .click();
    // Список закрывается и возвращает фокус в поле — ждём, иначе Ctrl+Enter
    // придёт в поповер и конвейер (правило «поверх — окно») его пропустит.
    await expect(page.getByRole('listbox', { name: 'Адресат' })).toHaveCount(0);

    // Сценарий «≤ 30 секунд»: Ctrl+Enter регистрирует без мыши.
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText(/Зарегистрировано:/)).toBeVisible({ timeout: 15_000 });

    // Сервер выдал номер и письмо ушло во «Входящие».
    await expect
      .poll(async () => {
        const res = await fetch(`${BASE_URL}/api/v1/letters/${letterId}`, {
          headers: { authorization: `Bearer ${adminToken}` },
        });
        if (res.status !== 200) return null;
        return (await res.json()) as LetterDto;
      })
      .toMatchObject({ regNumber: expect.stringMatching(/^Вх-\d{4}\/\d+$/) });
    const detail = (await (
      await fetch(`${BASE_URL}/api/v1/letters/${letterId}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      })
    ).json()) as LetterDto;
    regNumber = detail.regNumber!;
  });

  test('сотрудник без права: «Новые» недоступны, письмо во «Входящих»', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginUi(page, SECOND.email, SECOND.password);
      await page.goto('/letters');
      await expect(page.getByRole('link', { name: 'Входящие' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Новые' })).toHaveCount(0);
      await expect(page.getByText(regNumber).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }

    const employeeToken = await apiLogin(SECOND.email, SECOND.password);
    const forbidden = await fetch(`${BASE_URL}/api/v1/letters?box=new`, {
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(forbidden.status).toBe(403);
  });
});
