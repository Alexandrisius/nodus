import { describe, expect, it } from 'vitest';

import {
  dictionaryCodeSchema,
  listDictionaryItemsQuerySchema,
  SystemDictionary,
} from './dictionary.schemas.js';

describe('dictionaryCodeSchema', () => {
  it('принимает kebab-case коды, в том числе системные', () => {
    for (const code of [SystemDictionary.DOCUMENT_KIND, 'building-types', 'kinds2']) {
      expect(dictionaryCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('отвергает регистр, пробелы, крайние и двойные дефисы, путь', () => {
    for (const code of ['Document-kind', 'вид', 'a b', '-a', 'a-', 'a--b', '../x', '1a', '']) {
      expect(dictionaryCodeSchema.safeParse(code).success, code).toBe(false);
    }
  });
});

describe('listDictionaryItemsQuerySchema', () => {
  it('по умолчанию — без архива, лимит 50; строковый флаг коерсится', () => {
    expect(listDictionaryItemsQuerySchema.parse({})).toEqual({ includeArchived: false, limit: 50 });
    expect(listDictionaryItemsQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(
      true,
    );
  });
});
