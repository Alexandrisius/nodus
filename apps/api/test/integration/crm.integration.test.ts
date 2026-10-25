import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CRM_EVENTS,
  ErrorCode,
  apiErrorResponseSchema,
  counterpartyBulkResultSchema,
  counterpartyCardSchema,
  counterpartyListItemSchema,
  counterpartyMatchSchema,
  contactPersonSchema,
  paginatedSchema,
} from '@nodus/contracts';

import { setupCrmFixture, type CrmTestFixture } from './crm-fixtures.js';

const cardPage = paginatedSchema(counterpartyListItemSchema);
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

/**
 * CRM: критерии приёмки на живом HTTP (#460) — «создаю контрагента и контакт,
 * при вводе похожего названия система подсказывает существующего» и
 * «контрагенты сохраняются после перезагрузки» (чтение отдельными запросами
 * по реальной PostgreSQL), плюс уникальность УНП и права (I8).
 */
describe.skipIf(!process.env.DATABASE_URL)('crm: создание, подсказка, права (integration)', () => {
  let crm: CrmTestFixture;
  let fx: CrmTestFixture['fx'];
  let employee: CrmTestFixture['employee'];
  let manager: CrmTestFixture['manager'];
  let create: CrmTestFixture['create'];
  let name: CrmTestFixture['name'];

  beforeAll(async () => {
    crm = await setupCrmFixture();
    ({ fx, employee, manager, create, name } = crm);
  }, 120_000);

  afterAll(async () => {
    await crm?.cleanup();
  });

  it('создаю контрагента и контакт; чтение отдельными запросами (критерии 1–2)', async () => {
    const card = await create({
      fullName: name('Открытое акционерное общество «Белэнергомонтаж»'),
      shortName: name('АО «Белэнергомонтаж»'),
      unp: 'УНП 100 123 456',
      address: '220004, г. Минск, ул. Притыцкого, 62',
      email: ' Info@Galurgiya.BY ',
      phone: '+375 17 200-11-22',
    });
    expect(card).toMatchObject({
      unp: '100123456',
      email: 'info@galurgiya.by',
      archivedAt: null,
      lettersCount: 0,
      projectsCount: 0,
      contactPersons: [],
    });

    const contactRes = await fx.api(manager, 'POST', `/counterparties/${card.id}/contacts`, {
      body: { fullName: 'Малевич Ростислав Тарасович', position: 'Начальник отдела' },
    });
    expect(contactRes.status).toBe(201);
    const contact = contactPersonSchema.parse(await contactRes.json());
    expect(contact).toMatchObject({ fullName: 'Малевич Ростислав Тарасович', archivedAt: null });

    // «Перезагрузка»: карточка и реестр — новыми запросами.
    const read = counterpartyCardSchema.parse(
      await json(await fx.api(employee, 'GET', `/counterparties/${card.id}`)),
    );
    expect(read.contactPersons.map((p) => p.id)).toEqual([contact.id]);
    expect(read.email).toBe('info@galurgiya.by');

    const list = cardPage.parse(
      await json(await fx.api(employee, 'GET', '/counterparties?limit=100')),
    );
    expect(list.items.find((i) => i.id === card.id)).toMatchObject({
      shortName: name('АО «Белэнергомонтаж»'),
      contactsCount: 1,
    });

    const events = await fx.prisma.event.findMany({
      where: { aggregateType: 'counterparty', aggregateId: card.id },
      select: { type: true },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual([
      CRM_EVENTS.COUNTERPARTY_CREATED,
      CRM_EVENTS.CONTACT_CHANGED,
    ]);
  });

  it('похожие: опечатка кириллицей находит существующего, точный УНП — первым, архивный помечен', async () => {
    // Имя первого кейса намеренно другое: два контрагента с одинаковым
    // названием в одном прогоне дают равный `word_similarity`, и «первый»
    // в выдаче решается UUID-тай-брейком — тест был флаки (#486).
    const galurgiya = await create({
      fullName: name('Открытое акционерное общество «Галургия»'),
      shortName: name('АО «Галургия»'),
      unp: '200123456',
    });
    await create({
      fullName: name('Общество с ограниченной ответственностью «ТехСнаб»'),
      shortName: name('ООО «ТехСнаб»'),
      unp: '200654321',
    });
    const similar = async (qs: string) =>
      (await json<unknown[]>(await fx.api(employee, 'GET', `/counterparties/similar?${qs}`))).map(
        (m) => counterpartyMatchSchema.parse(m),
      );

    const typo = await similar(`name=${encodeURIComponent('Галургея')}`);
    expect(typo[0]).toMatchObject({ id: galurgiya.id, matchedBy: 'name' });
    expect(typo.some((m) => m.shortName.includes('ТехСнаб'))).toBe(false);

    const byUnp = await similar('unp=%D0%A3%D0%9D%D0%9F%20200123456');
    expect(byUnp[0]).toMatchObject({ id: galurgiya.id, matchedBy: 'unp' });

    // Архивный — в подсказке с пометкой (выбрать нельзя, но видно, что он есть).
    await fx.api(manager, 'POST', `/counterparties/${galurgiya.id}/archive`);
    expect((await similar(`name=${encodeURIComponent('Галургия')}`))[0]?.archivedAt).toBeTruthy();
    await fx.api(manager, 'POST', `/counterparties/${galurgiya.id}/restore`);
  });

  it('УНП уникален среди всех записей, включая архив: 409 с details', async () => {
    const first = await create({
      fullName: name('Дубль'),
      shortName: name('Дубль'),
      unp: '300123456',
    });
    const dup = await fx.api(manager, 'POST', '/counterparties', {
      body: { fullName: name('Дубль-2'), shortName: name('Дубль-2'), unp: '300-123-456' },
    });
    expect(dup.status).toBe(409);
    const error = apiErrorResponseSchema.parse(await dup.json());
    expect(error.code).toBe(ErrorCode.CRM_UNP_TAKEN);
    expect(error.details).toMatchObject({ counterpartyId: first.id, archived: false });

    await fx.api(manager, 'POST', `/counterparties/${first.id}/archive`);
    const archivedDup = await fx.api(manager, 'POST', '/counterparties', {
      body: { fullName: name('Дубль-3'), shortName: name('Дубль-3'), unp: '300123456' },
    });
    expect(archivedDup.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await archivedDup.json()).details).toMatchObject({
      archived: true,
    });
  });

  it('удаление: без связей — физически, со связью — 409 и запись остаётся', async () => {
    const free = await create({ fullName: name('Удаляемый'), shortName: name('Удаляемый') });
    const contact = contactPersonSchema.parse(
      await json(
        await fx.api(manager, 'POST', `/counterparties/${free.id}/contacts`, {
          body: { fullName: 'Удаляемое лицо' },
        }),
      ),
    );
    // Контакт удаляется физически (204), карточка его больше не отдаёт.
    const contactDelete = await fx.api(
      manager,
      'DELETE',
      `/counterparties/${free.id}/contacts/${contact.id}`,
    );
    expect(contactDelete.status).toBe(204);
    const afterContact = counterpartyCardSchema.parse(
      await json(await fx.api(manager, 'GET', `/counterparties/${free.id}`)),
    );
    expect(afterContact.contactPersons).toEqual([]);

    // Контрагент без связей удаляется (204) и пропадает из реестра.
    expect((await fx.api(manager, 'DELETE', `/counterparties/${free.id}`)).status).toBe(204);
    expect((await fx.api(manager, 'GET', `/counterparties/${free.id}`)).status).toBe(404);
    expect((await fx.api(manager, 'DELETE', `/counterparties/${free.id}`)).status).toBe(404);

    // Со ссылкой (проекция usages) — 409 CRM_COUNTERPARTY_IN_USE, запись жива.
    const used = await create({ fullName: name('Связанный'), shortName: name('Связанный') });
    await fx.prisma.counterpartyUsage.create({
      data: { sourceKind: 'project', sourceId: crypto.randomUUID(), counterpartyId: used.id },
    });
    const inUse = await fx.api(manager, 'DELETE', `/counterparties/${used.id}`);
    expect(inUse.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await inUse.json()).code).toBe(
      ErrorCode.CRM_COUNTERPARTY_IN_USE,
    );
    expect((await fx.api(manager, 'GET', `/counterparties/${used.id}`)).status).toBe(200);

    // Массовое удаление: свободная удаляется, связанная — пропущена с причиной.
    const bulk = counterpartyBulkResultSchema.parse(
      await json(
        await fx.api(manager, 'POST', '/counterparties/bulk', {
          body: { counterpartyIds: [used.id], action: { kind: 'delete' } },
        }),
      ),
    );
    expect(bulk.results[0]).toMatchObject({
      counterpartyId: used.id,
      ok: false,
      code: ErrorCode.CRM_COUNTERPARTY_IN_USE,
    });
  });

  it('права: сотрудник читает справочник, но не создаёт и не правит (I8)', async () => {
    const card = await create({ fullName: name('Права'), shortName: name('Права') });
    expect((await fx.api(employee, 'GET', '/counterparties')).status).toBe(200);
    expect((await fx.api(employee, 'GET', `/counterparties/${card.id}`)).status).toBe(200);

    const denied = await fx.api(employee, 'POST', '/counterparties', {
      body: { fullName: name('Нельзя'), shortName: name('Нельзя') },
    });
    expect(denied.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await denied.json()).code).toBe(ErrorCode.FORBIDDEN);

    const patch = await fx.api(employee, 'PATCH', `/counterparties/${card.id}`, {
      body: { phone: '1' },
    });
    expect(patch.status).toBe(403);
    expect((await fx.api(employee, 'POST', `/counterparties/${card.id}/archive`)).status).toBe(403);
  });
});
