import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { encodeCursor } from '../../core/pagination/cursor.util.js';
import { DictionariesService } from './dictionaries.service.js';

const DICT_ID = '00000000-0000-4000-8000-0000000000d1';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function item(n: number, sortOrder: number, name: string) {
  return {
    id: uuid(n),
    dictionaryId: DICT_ID,
    parentId: null,
    code: null,
    name,
    sortOrder,
    isActive: true,
  };
}

const kind = {
  id: DICT_ID,
  code: 'document-kind',
  name: 'Вид документа',
  hierarchical: false,
  isSystem: true,
};

describe('DictionariesService', () => {
  const repo = {
    listDictionaries: vi.fn(),
    findDictionaryByCode: vi.fn(),
    listItems: vi.fn(),
  };
  let service: DictionariesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DictionariesService(repo as never);
  });

  describe('listItems', () => {
    it('неизвестный код справочника → NOT_FOUND, элементы не читаются', async () => {
      repo.findDictionaryByCode.mockResolvedValue(null);
      await expect(
        service.listItems('no-such', { limit: 50, includeArchived: false }),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
      expect(repo.listItems).not.toHaveBeenCalled();
    });

    it('лишняя строка → nextCursor по последней выданной (sortOrder, name, id)', async () => {
      repo.findDictionaryByCode.mockResolvedValue(kind);
      repo.listItems.mockResolvedValue([
        item(1, 10, 'Письмо'),
        item(2, 20, 'Договор'),
        item(3, 30, 'Приказ'),
      ]);

      const first = await service.listItems('document-kind', { limit: 2, includeArchived: false });

      expect(first.items.map((i) => i.name)).toEqual(['Письмо', 'Договор']);
      expect(repo.listItems).toHaveBeenCalledWith(DICT_ID, {
        includeArchived: false,
        limit: 2,
        after: null,
      });

      repo.listItems.mockResolvedValue([item(3, 30, 'Приказ')]);
      const second = await service.listItems('document-kind', {
        limit: 2,
        includeArchived: true,
        cursor: first.nextCursor!,
      });

      expect(repo.listItems).toHaveBeenLastCalledWith(DICT_ID, {
        includeArchived: true,
        limit: 2,
        after: { sortOrder: 20, name: 'Договор', id: uuid(2) },
      });
      expect(second).toEqual({ items: [item(3, 30, 'Приказ')], nextCursor: null });
    });

    it('битый курсор → VALIDATION_FAILED, а не тихий сброс на первую страницу', async () => {
      repo.findDictionaryByCode.mockResolvedValue(kind);
      await expect(
        service.listItems('document-kind', {
          limit: 50,
          includeArchived: false,
          cursor: encodeCursor({ sortOrder: 'x' }),
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect(repo.listItems).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('курсор — по code последнего справочника страницы', async () => {
      repo.listDictionaries.mockResolvedValue([kind, { ...kind, id: uuid(9), code: 'work-kind' }]);

      const res = await service.list({ limit: 1 });

      expect(res.items).toEqual([kind]);
      repo.listDictionaries.mockResolvedValue([]);
      await service.list({ limit: 1, cursor: res.nextCursor! });
      expect(repo.listDictionaries).toHaveBeenLastCalledWith(1, 'document-kind');
    });
  });
});
