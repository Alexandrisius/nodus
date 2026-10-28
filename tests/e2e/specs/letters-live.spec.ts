import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, SECOND } from '../e2e-users.js';

/**
 * Живой e2e корреспонденции (#56, критичный путь): канцелярия (админ) ведёт
 * бумажное письмо из «Новых» к регистрации по канону редизайна «≤ 30 секунд
 * без окна» — обязательные поля заполняются ПО МЕСТУ в карточке (кнопка
 * значения → ввод → Enter), заполненное письмо «Зарегистрировать» в баре
 * идёт напрямую, номер «Вх-ГГГГ/N» приходит тостом, карточка закрывается.
 * Сотрудник без `correspondence.register` не видит вкладку «Новые», но
 * видит письмо с номером во «Входящих».
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

    // Ручное входящее (скан): mainIndex=0 — основной документ уже назначен.
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

  test('канцелярия регистрирует письмо по месту в карточке — без окна', async ({ page }) => {
    test.setTimeout(120_000);
    await loginUi(page, ADMIN.email, ADMIN.password);
    await page.goto('/letters?tab=new');

    // «Новые» — таблица; ручное письмо до регистрации без темы («Письмо без
    // темы»), узнаём по источнику «внесено вручную» и свежести (received_at
    // DESC — первая строка). Точное соответствие уточняет poll по letterId.
    const row = page.getByRole('row', { name: /внесено вручную/ }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    // ── Поля по месту (канон редизайна: карточка = форма) ──────────────────

    // Корреспондент: «Не задано» открывает комбобокс со списком сразу.
    await page.getByRole('button', { name: 'Изменить: Корреспондент' }).click();
    await page.getByRole('combobox', { name: 'Корреспондент' }).fill(COUNTERPARTY);
    await page
      .getByRole('option', { name: new RegExp(COUNTERPARTY) })
      .first()
      .click();

    // № корреспондента — кнопка значения → инпут по месту; Enter фиксирует.
    await page.getByRole('button', { name: 'Изменить: № корреспондента' }).click();
    await page.getByRole('textbox', { name: 'Изменить: № корреспондента' }).fill(THEIR_NUMBER);
    await page.keyboard.press('Enter');

    // Дата корреспондента: календарь карточки — кнопка быстрой даты.
    await page.getByRole('button', { name: 'Изменить: Дата корреспондента' }).click();
    await page.getByRole('button', { name: /^Сегодня/ }).click();

    // Способ поступления (обязательное): «Почта» из системного справочника.
    await page.getByRole('button', { name: 'Изменить: Способ поступления' }).click();
    await page.getByRole('menuitem', { name: 'Почта', exact: true }).click();

    // Тема — в хроме карточки: кнопка заголовка открывает инпут по месту.
    await page.getByTitle('Изменить: Тема').click();
    await page.getByRole('textbox', { name: 'Изменить: Тема' }).fill(SUBJECT);
    await page.keyboard.press('Enter');

    // Адресат: селектор регистрации, список открыт кликом.
    await page.getByRole('button', { name: 'Изменить: Адресат' }).click();
    await page
      .getByRole('option', { name: /Администратор|Климович|night/ })
      .first()
      .click();

    // Всё заполнено — регистрация идёт НАПРЯМУЮ, без окна пропусков.
    await page.getByRole('button', { name: 'Зарегистрировать', exact: true }).click();
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
