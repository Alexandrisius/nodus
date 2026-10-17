import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service.js';

/** Позиция keyset-курсора списка элементов: порядок (sortOrder, name, id). */
export interface ItemCursor {
  sortOrder: number;
  name: string;
  id: string;
}

const dictionarySelect = {
  id: true,
  code: true,
  name: true,
  hierarchical: true,
  isSystem: true,
} as const;

const itemSelect = {
  id: true,
  dictionaryId: true,
  parentId: true,
  code: true,
  name: true,
  sortOrder: true,
  isActive: true,
} as const;

/** Доступ к таблицам dictionaries / dictionary_items (модуль ядра, I15). */
@Injectable()
export class DictionariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Страница справочников по `code` (+1 строка — признак следующей страницы). */
  async listDictionaries(limit: number, afterCode: string | null) {
    return this.prisma.dictionary.findMany({
      where: afterCode ? { code: { gt: afterCode } } : {},
      orderBy: { code: 'asc' },
      take: limit + 1,
      select: dictionarySelect,
    });
  }

  async findDictionaryByCode(code: string) {
    return this.prisma.dictionary.findUnique({ where: { code }, select: dictionarySelect });
  }

  /** Страница элементов справочника, keyset по (sortOrder, name, id); +1 строка. */
  async listItems(
    dictionaryId: string,
    opts: { includeArchived: boolean; limit: number; after: ItemCursor | null },
  ) {
    const { after } = opts;
    return this.prisma.dictionaryItem.findMany({
      where: {
        dictionaryId,
        ...(opts.includeArchived ? {} : { isActive: true }),
        ...(after
          ? {
              OR: [
                { sortOrder: { gt: after.sortOrder } },
                { sortOrder: after.sortOrder, name: { gt: after.name } },
                { sortOrder: after.sortOrder, name: after.name, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: opts.limit + 1,
      select: itemSelect,
    });
  }
}
