import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  Dictionary,
  DictionaryItem,
  ListDictionariesQuery,
  ListDictionaryItemsQuery,
  Paginated,
} from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';
import { decodeCursor, encodeCursor } from '../../core/pagination/cursor.util.js';
import { DictionariesRepository } from './dictionaries.repository.js';

const dictionaryCursorSchema = z.object({ code: z.string().min(1) });
const itemCursorSchema = z.object({
  sortOrder: z.number().int(),
  name: z.string(),
  id: z.uuid(),
});

/** Отрезает лишнюю (+1) строку и строит курсор по последней выданной. */
function page<T>(rows: T[], limit: number, cursorOf: (row: T) => Record<string, unknown>) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(cursorOf(last)) : null,
  };
}

/**
 * Справочники — чтение для потребителей (формы, фильтры): список справочников
 * и элементы справочника по коду. Управление элементами (создание, правка,
 * архивация + события dictionary.*) — с UI справочников админ-контура (M12).
 */
@Injectable()
export class DictionariesService {
  constructor(private readonly dictionaries: DictionariesRepository) {}

  async list(query: ListDictionariesQuery): Promise<Paginated<Dictionary>> {
    const after = query.cursor ? decodeCursor(query.cursor, dictionaryCursorSchema).code : null;
    const rows = await this.dictionaries.listDictionaries(query.limit, after);
    return page(rows, query.limit, (d) => ({ code: d.code }));
  }

  async listItems(
    code: string,
    query: ListDictionaryItemsQuery,
  ): Promise<Paginated<DictionaryItem>> {
    const dictionary = await this.dictionaries.findDictionaryByCode(code);
    if (!dictionary) {
      throw DomainException.notFound('Dictionary not found', { code });
    }
    const after = query.cursor ? decodeCursor(query.cursor, itemCursorSchema) : null;
    const rows = await this.dictionaries.listItems(dictionary.id, {
      includeArchived: query.includeArchived,
      limit: query.limit,
      after,
    });
    return page(rows, query.limit, (i) => ({ sortOrder: i.sortOrder, name: i.name, id: i.id }));
  }
}
