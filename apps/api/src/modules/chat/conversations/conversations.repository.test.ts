import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationsRepository } from './conversations.repository.js';

/** Список бесед (#215, аудит #317): ORDER BY и keyset-курсор — по той же
 *  оси активности, что выдаётся клиенту (last_activity_at), а не по
 *  last_message_at — иначе «Избранное» со свежей звездой встаёт не туда. */

const ME = '00000000-0000-0000-0000-000000000001';

/** Нормализованный SQL-текст (Prisma.sql → строка без лишних пробелов). */
function sqlOf(call: unknown[]): string {
  return (call[0] as { sql: string }).sql.replace(/\s+/g, ' ');
}

describe('ConversationsRepository.listForUser — ось сортировки', () => {
  const prisma = { $queryRaw: vi.fn() };
  let repo: ConversationsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    repo = new ConversationsRepository(prisma as never);
  });

  it('ORDER BY — выражение активности (GREATEST с закладками), детерминированно с id', async () => {
    // Act
    await repo.listForUser(ME, { limit: 50 });

    // Assert
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    const orderBy = sql.slice(sql.lastIndexOf('ORDER BY'));
    expect(orderBy).toMatch(/GREATEST\( c\.last_message_at, \(SELECT max\(f\.created_at\)/);
    expect(orderBy).toMatch(/END DESC NULLS LAST, c\.id DESC/);
    expect(orderBy).not.toMatch(/ORDER BY c\.last_message_at/);
  });

  it('курсор — keyset по тому же выражению активности', async () => {
    await repo.listForUser(ME, {
      limit: 50,
      cursor: { at: '2026-09-24T10:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' },
    });

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    const where = sql.slice(sql.indexOf('WHERE'), sql.lastIndexOf('ORDER BY'));
    expect(where).toMatch(
      /CASE WHEN c\.type = 'direct'.*END, c\.id\) < \(\?::timestamptz, \?::uuid\)/,
    );
  });

  it('курсор с активностью — беседы без активности (хвост NULLS LAST) не теряются', async () => {
    await repo.listForUser(ME, {
      limit: 50,
      cursor: { at: '2026-09-24T10:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' },
    });

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    const where = sql.slice(sql.indexOf('WHERE'), sql.lastIndexOf('ORDER BY'));
    expect(where).toMatch(/END IS NULL OR \(/);
  });

  it('курсор внутри NULL-хвоста — только беседы без активности дальше по id', async () => {
    await repo.listForUser(ME, {
      limit: 50,
      cursor: { at: null, id: '11111111-1111-4111-8111-111111111111' },
    });

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    const where = sql.slice(sql.indexOf('WHERE'), sql.lastIndexOf('ORDER BY'));
    expect(where).toMatch(/END IS NULL AND c\.id < \?::uuid\)/);
    expect(where).not.toMatch(/infinity/);
  });
});

describe('ConversationsRepository.unreadSummaryForUser — сводка вкладок (#409)', () => {
  const prisma = { $queryRaw: vi.fn() };
  let repo: ConversationsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ chats: 3, entities: 2, total: 5 }]);
    repo = new ConversationsRepository(prisma as never);
  });

  it('суммирует ТОТ ЖЕ предикат непрочитанного, что список (треды канала + правленные)', async () => {
    await repo.unreadSummaryForUser(ME);

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    expect(sql).toMatch(/FROM messages um/);
    expect(sql).toMatch(/um\.author_id <> \?::uuid/);
    expect(sql).toMatch(/um\.seq > cm\.last_read_seq/);
    expect(sql).toMatch(/thread_participants tp/);
    expect(sql).toMatch(/tp\.seq > tp\.last_read_seq|um\.seq > tp\.last_read_seq/);
  });

  it('раскладывает по вкладкам: task/letter — entities, остальное — chats', async () => {
    await repo.unreadSummaryForUser(ME);

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    expect(sql).toMatch(/FILTER \(WHERE c\.type NOT IN \('task', 'letter'\)\)/);
    expect(sql).toMatch(/FILTER \(WHERE c\.type IN \('task', 'letter'\)\)/);
  });

  it('скрытые и snoozed беседы не входят в счётчики', async () => {
    await repo.unreadSummaryForUser(ME);

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]!);
    expect(sql).toMatch(/cm\.hidden = false/);
    expect(sql).toMatch(/cm\.snoozed = false/);
  });

  it('нет бесед — нулевая сводка, а не undefined', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(repo.unreadSummaryForUser(ME)).resolves.toEqual({
      chats: 0,
      entities: 0,
      total: 0,
    });
  });
});
