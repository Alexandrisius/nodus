import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, SECOND } from '../e2e-users.js';

/**
 * Живой e2e корреспонденции (#56, критичный путь регистрации): канцелярия
 * (админ) регистрирует письмо из «Новых» карточкой-формой — бар
 * «Зарегистрировать» с пустыми полями открывает окно контроля пропусков,
 * заполнение (корреспондент, № и дата корреспондента, тема, адресат) —
 * «Зарегистрировать» в окне, номер «Вх-ГГГГ/N» приходит тостом, карточка
 * закрывается. Сотрудник без `correspondence.register` не видит вкладку
 * «Новые», но видит письмо с номером во «Входящих».
 *
 * Требует живой стек без моков (api + web + MinIO + Gotenberg):
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

test.describe('живая корреспонденция (#56)', () => {
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

    // Ручное входящее (скан): mainIndex=0 — основной документ уже назначен,
    // звезда в окне регистрации горит на нём.
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

  test('канцелярия регистрирует письмо карточкой-формой через окно пропусков', async ({ page }) => {
    test.setTimeout(120_000);
    await loginUi(page, ADMIN.email, ADMIN.password);
    await page.goto('/letters?tab=new');

    // «Новые» — таблица; наше письмо свежее (received_at DESC) — первая строка.
    const row = page.getByRole('row', { name: new RegExp(SUBJECT) }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    // Обязательные поля пусты: бар ведёт в окно «контроль пропусков».
    await page.getByRole('button', { name: 'Зарегистрировать', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Основной документ уже выбран (mainIndex) — пропуск не горит.
    await expect(dialog.getByText('Основной документ')).toBeVisible();

    await dialog.getByRole('combobox', { name: 'Корреспондент' }).click();
    await dialog.getByRole('combobox', { name: 'Корреспондент' }).fill(COUNTERPARTY);
    await dialog
      .getByRole('option', { name: new RegExp(COUNTERPARTY) })
      .first()
      .click();

    await dialog.getByLabel('№ корреспондента').fill(THEIR_NUMBER);
    await dialog.getByLabel('Дата корреспондента').fill('01.10.2026');
    await dialog.getByLabel('Тема', { exact: true }).fill(SUBJECT);

    await dialog.getByRole('combobox', { name: 'Адресат' }).click();
    // Список «Принимают решения»: в сиде песочницы это тестовые держатели.
    await dialog
      .getByRole('option', { name: /Администратор|Климович|night/ })
      .first()
      .click();
    await expect(dialog.getByRole('listbox')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Зарегистрировать' }).click();
    // Номер — тостом; карточка закрывается — возврат к списку «Новых».
    await expect(page.getByText(/Зарегистрировано:/)).toBeVisible({ timeout: 20_000 });

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
