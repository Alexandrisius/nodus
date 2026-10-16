import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserListItem } from '@nodus/contracts';

import { api } from '../api-client.js';
import { fetchAllUsers, usersKeys, usersListKey } from './users-list.js';

vi.mock('../api-client.js', () => ({ api: vi.fn() }));

/**
 * Справочник целиком на клиенте: добор всех страниц по nextCursor (limit=100),
 * мок без курсора (nextCursor=null) — один запрос.
 */

const user = (id: string) => ({ id, displayName: `Сотрудник ${id}` }) as unknown as UserListItem;

describe('fetchAllUsers', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('добирает все страницы по nextCursor и склеивает items', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ items: [user('a'), user('b')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [user('c')], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [user('d')], nextCursor: null });

    const result = await fetchAllUsers();

    expect(result.items.map((u) => u.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.nextCursor).toBeNull();
    const urls = vi.mocked(api).mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('limit=100');
    expect(urls[0]).not.toContain('cursor=');
    expect(urls[1]).toContain('cursor=c1');
    expect(urls[2]).toContain('cursor=c2');
  });

  it('ответ без курсора (мок MSW) — один запрос', async () => {
    vi.mocked(api).mockResolvedValue({ items: [user('a')], nextCursor: null });
    const result = await fetchAllUsers();
    expect(result.items).toHaveLength(1);
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
  });

  it('«вечный» курсор не вешает цикл — предохранитель страниц', async () => {
    vi.mocked(api).mockResolvedValue({ items: [user('x')], nextCursor: 'same' });
    await fetchAllUsers();
    expect(vi.mocked(api).mock.calls.length).toBeLessThanOrEqual(50);
  });
});

describe('usersKeys', () => {
  it('ключи поиска — под базовым ключом справочника', () => {
    expect(usersKeys.search('add-members', 'ив').slice(0, 2)).toEqual([...usersListKey]);
    expect(usersKeys.search('search', '')).toEqual(['directory', 'users', 'search', '']);
  });
});
