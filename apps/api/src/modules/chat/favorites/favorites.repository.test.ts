import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FavoritesRepository } from './favorites.repository.js';

/** Курсор списка избранного (аудит #317): keyset по (created_at, message_id),
 *  без Prisma `cursor` — якорь-закладку мог погасить каскад удаления. */

const ME = '00000000-0000-0000-0000-000000000001';
const ANCHOR = '00000000-0000-0000-0000-0000000000a1';
const T = '2026-10-04T01:00:00.000Z';

describe('FavoritesRepository.list — keyset-курсор', () => {
  const prisma = { favorite: { findMany: vi.fn() }, $queryRaw: vi.fn() };
  let repo: FavoritesRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.favorite.findMany.mockResolvedValue([]);
    repo = new FavoritesRepository(prisma as never);
  });

  it('с курсором: условие (created_at, message_id) < (t, id), без cursor/skip Prisma', async () => {
    // Act
    await repo.list(ME, { limit: 20 }, { t: T, id: ANCHOR });

    // Assert
    const args = prisma.favorite.findMany.mock.calls[0]![0];
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
    expect(args.where.OR).toEqual([
      { createdAt: { lt: new Date(T) } },
      { createdAt: new Date(T), messageId: { lt: ANCHOR } },
    ]);
    // Детерминированная сортировка — тот же ключ, что у курсора.
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { messageId: 'desc' }]);
    expect(args.take).toBe(21);
  });

  it('без курсора — без keyset-условия', async () => {
    await repo.list(ME, { limit: 20 }, null);

    const args = prisma.favorite.findMany.mock.calls[0]![0];
    expect(args.where.OR).toBeUndefined();
  });

  it('следующий курсор — по последней строке страницы (limit+1 — детектор)', async () => {
    const record = (id: string, at: string) => ({
      userId: ME,
      messageId: id,
      labels: [],
      createdAt: new Date(at),
      updatedAt: new Date(at),
      message: { conversation: { id: 'c', type: 'group', title: null } },
    });
    prisma.favorite.findMany.mockResolvedValue([
      record('00000000-0000-0000-0000-0000000000b2', '2026-10-04T03:00:00.000Z'),
      record('00000000-0000-0000-0000-0000000000b1', '2026-10-04T02:00:00.000Z'),
    ]);

    const page = await repo.list(ME, { limit: 1 }, null);

    expect(page.rows).toHaveLength(1);
    expect(page.nextCursor).toEqual({
      t: '2026-10-04T03:00:00.000Z',
      id: '00000000-0000-0000-0000-0000000000b2',
    });
  });
});
