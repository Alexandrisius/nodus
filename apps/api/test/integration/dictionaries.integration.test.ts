import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  dictionaryItemSchema,
  dictionarySchema,
  ErrorCode,
  paginatedSchema,
  SystemDictionary,
} from '@nodus/contracts';

import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

const itemsPage = paginatedSchema(dictionaryItemSchema);

/**
 * Справочники на живом HTTP (#54): системный «Вид документа» засеян
 * миграцией (на любой установке, без prisma/seed), чтение — любому
 * аутентифицированному, keyset-пагинация без дублей и пропусков,
 * архив скрыт по умолчанию.
 */
describe.skipIf(!process.env.DATABASE_URL)('dictionaries (integration)', () => {
  let fx: ChatTestFixture<'alice'>;
  let alice: ChatUser;
  let scratchCode: string;

  beforeAll(async () => {
    fx = await setupChatFixture(['alice']);
    alice = fx.users.alice;
    // Справочник прогона: два элемента с равным sortOrder (тай-брейк по name, id) + архивный.
    scratchCode = `it-scratch-${fx.runId}`;
    await fx.prisma.dictionary.create({
      data: {
        code: scratchCode,
        name: 'Тестовый справочник',
        items: {
          create: [
            { name: 'Бета', sortOrder: 1 },
            { name: 'Альфа', sortOrder: 1 },
            { name: 'Гамма', sortOrder: 0 },
            { name: 'Архивный', sortOrder: 2, isActive: false },
          ],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (fx && scratchCode) {
      await fx.prisma.dictionaryItem.deleteMany({ where: { dictionary: { code: scratchCode } } });
      await fx.prisma.dictionary.deleteMany({ where: { code: scratchCode } });
    }
    await fx?.cleanup();
  });

  it('«Вид документа» засеян миграцией: «Письмо» первым, сотрудник без прав читает', async () => {
    const res = await fx.api(alice, 'GET', `/dictionaries/${SystemDictionary.DOCUMENT_KIND}/items`);
    expect(res.status).toBe(200);
    const { items } = itemsPage.parse(await res.json());
    expect(items[0]).toMatchObject({ code: 'letter', name: 'Письмо', parentId: null });
    expect(items.map((i) => i.code)).toEqual(
      expect.arrayContaining(['letter', 'contract', 'order', 'request', 'act']),
    );

    const list = paginatedSchema(dictionarySchema).parse(
      await (await fx.api(alice, 'GET', '/dictionaries?limit=100')).json(),
    );
    expect(list.items.find((d) => d.code === SystemDictionary.DOCUMENT_KIND)).toMatchObject({
      isSystem: true,
      hierarchical: false,
    });
  });

  it('keyset-пагинация: страницы по 1 дают тот же порядок без дублей; архив скрыт', async () => {
    const names: string[] = [];
    let cursor: string | null = null;
    do {
      const qs: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const res = await fx.api(alice, 'GET', `/dictionaries/${scratchCode}/items?limit=1${qs}`);
      expect(res.status).toBe(200);
      const body = itemsPage.parse(await res.json());
      names.push(...body.items.map((i) => i.name));
      cursor = body.nextCursor;
    } while (cursor);
    expect(names).toEqual(['Гамма', 'Альфа', 'Бета']);

    const all = itemsPage.parse(
      await (
        await fx.api(alice, 'GET', `/dictionaries/${scratchCode}/items?includeArchived=true`)
      ).json(),
    );
    expect(all.items.map((i) => [i.name, i.isActive])).toEqual([
      ['Гамма', true],
      ['Альфа', true],
      ['Бета', true],
      ['Архивный', false],
    ]);
  });

  it('ошибки единого формата: неизвестный код — 404, кривой код и курсор — 400, без токена — 401', async () => {
    const missing = await fx.api(alice, 'GET', '/dictionaries/no-such-dictionary/items');
    expect(missing.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await missing.json()).code).toBe(ErrorCode.NOT_FOUND);

    for (const path of [
      '/dictionaries/Bad_Code/items',
      `/dictionaries/${scratchCode}/items?cursor=x`,
    ]) {
      const res = await fx.api(alice, 'GET', path);
      expect(res.status, path).toBe(400);
      expect(apiErrorResponseSchema.parse(await res.json()).code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    const anonymous = await fetch(`${fx.baseUrl}/dictionaries`);
    expect(anonymous.status).toBe(401);
  });
});
