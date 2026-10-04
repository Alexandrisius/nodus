import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { FavoritesService } from './favorites.service.js';
import type { FavoriteRow, FavoritesRepository } from './favorites.repository.js';
import type { MessageRow } from '../messages/messages.repository.js';

/** Избранное (#171): права (только сообщения своих бесед), идемпотентность
 *  звезды (PK), порядок цепочки (createdAt = now+i), тихое снятие, 404 правки
 *  чужой/несуществующей закладки. */

const ME = 'me-1';
const OTHER = 'other-1';
const CONV = 'conv-1';
const CONV_OTHER = 'conv-other';

function makeMessage(id: string, conversationId: string): MessageRow {
  const now = new Date('2026-10-04T00:00:00Z');
  return {
    id,
    conversationId,
    seq: 1n,
    authorId: OTHER,
    clientMessageId: 'c',
    text: `текст ${id}`,
    replyToId: null,
    replySnapshot: null,
    threadRootId: null,
    fwdConversationId: null,
    fwdMessageId: null,
    fwdAuthorId: null,
    fwdThreadRootId: null,
    editedAt: null,
    deletedAt: null,
    obliterated: false,
    urgent: false,
    mentionedUserIds: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRow(messageId: string, conversationId = CONV): FavoriteRow {
  return {
    userId: ME,
    messageId,
    labels: [],
    createdAt: new Date('2026-10-04T01:00:00Z'),
    updatedAt: new Date('2026-10-04T01:00:00Z'),
    message: makeMessage(messageId, conversationId),
    conversation: { id: conversationId, type: 'group', title: 'Проект' },
  };
}

describe('FavoritesService (#171)', () => {
  let favorites: {
    findExisting: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    findRow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    distinctLabels: ReturnType<typeof vi.fn>;
  };
  let cards: { toDtos: ReturnType<typeof vi.fn> };
  let messages: {
    findByIds: ReturnType<typeof vi.fn>;
    touchLastMessageAt: ReturnType<typeof vi.fn>;
  };
  let conversations: {
    findMembership: ReturnType<typeof vi.fn>;
    isNotesConversation: ReturnType<typeof vi.fn>;
    findOrCreateDirect: ReturnType<typeof vi.fn>;
  };
  let eventBus: { emit: ReturnType<typeof vi.fn> };
  let service: FavoritesService;

  beforeEach(() => {
    favorites = {
      findExisting: vi.fn().mockResolvedValue(new Set<string>()),
      create: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      findRow: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      distinctLabels: vi.fn().mockResolvedValue([]),
    };
    cards = { toDtos: vi.fn().mockResolvedValue([]) };
    messages = { findByIds: vi.fn(), touchLastMessageAt: vi.fn().mockResolvedValue(undefined) };
    conversations = {
      findMembership: vi.fn(),
      isNotesConversation: vi.fn().mockResolvedValue(false),
      findOrCreateDirect: vi.fn().mockResolvedValue({ id: 'notes-1', created: false }),
    };
    eventBus = { emit: vi.fn().mockResolvedValue(undefined) };
    const txRunner = {
      run: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn('tx-handle')),
    };
    service = new FavoritesService(
      favorites as unknown as FavoritesRepository,
      cards as never,
      messages as never,
      conversations as never,
      eventBus as never,
      txRunner as never,
    );
  });

  it('add: звезда на сообщения СВОИХ бесед; чужие/несуществующие молча пропускаются', async () => {
    messages.findByIds.mockResolvedValue([makeMessage('m1', CONV), makeMessage('m2', CONV_OTHER)]);
    conversations.findMembership.mockImplementation(async (conversationId: string) =>
      conversationId === CONV ? { userId: ME } : null,
    );
    favorites.findRow.mockResolvedValue(makeRow('m1'));
    cards.toDtos.mockImplementation(async (rows: FavoriteRow[]) =>
      rows.map((row) => ({ messageId: row.messageId })),
    );

    const result = await service.add(ME, { messageIds: ['m1', 'm2', 'm-missing'] });

    expect(favorites.create).toHaveBeenCalledTimes(1);
    expect(favorites.create).toHaveBeenCalledWith(ME, 'm1', expect.any(Date), 'tx-handle');
    // Карточки — только доступные (m2/m-missing отфильтрованы).
    expect(result.items).toEqual([{ messageId: 'm1' }]);
  });

  it('add (#215): новая звезда — активность «Избранного»: беседа поднимается в списке', async () => {
    // Фидбек приёмки: сортировка списка — по last_message_at; без бампа
    // добавленное никто не заметит. Find-or-create: первая звезда сразу
    // создаёт чат в списке.
    messages.findByIds.mockResolvedValue([makeMessage('m1', CONV)]);
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.findRow.mockResolvedValue(makeRow('m1'));

    await service.add(ME, { messageIds: ['m1'] });

    expect(conversations.findOrCreateDirect).toHaveBeenCalledWith(ME, ME, 'tx-handle');
    expect(messages.touchLastMessageAt).toHaveBeenCalledWith('notes-1', 'tx-handle');
  });

  it('add (#215): идемпотентный повтор — активность «Избранного» НЕ трогается', async () => {
    messages.findByIds.mockResolvedValue([makeMessage('m1', CONV)]);
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.findExisting.mockResolvedValue(new Set(['m1']));
    favorites.findRow.mockResolvedValue(makeRow('m1'));

    await service.add(ME, { messageIds: ['m1'] });

    expect(conversations.findOrCreateDirect).not.toHaveBeenCalled();
    expect(messages.touchLastMessageAt).not.toHaveBeenCalled();
  });

  it('add: порядок цепочки — createdAt монотонен по порядку массива', async () => {
    messages.findByIds.mockResolvedValue([
      makeMessage('m1', CONV),
      makeMessage('m2', CONV),
      makeMessage('m3', CONV),
    ]);
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.findRow.mockImplementation(async (_userId: string, id: string) => makeRow(id));
    cards.toDtos.mockImplementation(async (rows: FavoriteRow[]) =>
      rows.map((row) => ({ messageId: row.messageId })),
    );

    const result = await service.add(ME, { messageIds: ['m1', 'm2', 'm3'] });
    const times = favorites.create.mock.calls.map((call) => call[2] as Date);
    expect(times[0]!.getTime()).toBeLessThan(times[1]!.getTime());
    expect(times[1]!.getTime()).toBeLessThan(times[2]!.getTime());
    expect(result.items.map((c) => c.messageId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('add: уже стоящая звезда идемпотентна — без дубля строки и события', async () => {
    messages.findByIds.mockResolvedValue([makeMessage('m1', CONV)]);
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.findExisting.mockResolvedValue(new Set(['m1']));
    favorites.findRow.mockResolvedValue(makeRow('m1'));
    cards.toDtos.mockResolvedValue([{ messageId: 'm1' }]);

    const result = await service.add(ME, { messageIds: ['m1'] });

    expect(favorites.create).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(result.items).toEqual([{ messageId: 'm1' }]);
  });

  it('add: событие chat.favorite_added — в той же транзакции, только на вставленные', async () => {
    messages.findByIds.mockResolvedValue([makeMessage('m1', CONV)]);
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.findRow.mockResolvedValue(makeRow('m1'));

    await service.add(ME, { messageIds: ['m1'] });

    expect(eventBus.emit).toHaveBeenCalledWith(
      'tx-handle',
      'chat.favorite_added',
      { userId: ME, conversationId: CONV, messageId: 'm1' },
      expect.objectContaining({ actorId: ME }),
    );
  });

  it('add: записи собственного «Избранного» РАЗРЕШЕНЫ (тэги на записях, ревизия 04.10 р.5)', async () => {
    messages.findByIds.mockResolvedValue([makeMessage('m1', CONV)]);
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.findExisting.mockResolvedValue(new Set());
    favorites.create.mockResolvedValue(true);
    favorites.findRow.mockResolvedValue(makeRow('m1'));
    cards.toDtos.mockResolvedValue([{ messageId: 'm1' }]);

    const result = await service.add(ME, { messageIds: ['m1'] });

    expect(favorites.create).toHaveBeenCalled();
    expect(result.items).toEqual([{ messageId: 'm1' }]);
  });

  it('remove: нет закладки — тихо (toggle-идемпотентность), с закладкой — событие', async () => {
    favorites.findRow.mockResolvedValue(null);
    await service.remove(ME, 'm1');
    expect(favorites.delete).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();

    favorites.findRow.mockResolvedValue(makeRow('m1'));
    await service.remove(ME, 'm1');
    expect(favorites.delete).toHaveBeenCalledWith(ME, 'm1', 'tx-handle');
    expect(eventBus.emit).toHaveBeenCalledWith(
      'tx-handle',
      'chat.favorite_removed',
      { userId: ME, conversationId: CONV, messageId: 'm1' },
      expect.objectContaining({ actorId: ME }),
    );
  });

  it('update: закладки нет — NOT_FOUND', async () => {
    favorites.findRow.mockResolvedValue(null);
    await expect(service.update(ME, 'm1', { labels: ['🔑'] })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('update: исключённый из беседы НЕ читает карточку (security: PATCH без членства — NOT_FOUND)', async () => {
    favorites.findRow.mockResolvedValue(makeRow('m1'));
    conversations.findMembership.mockResolvedValue(null);
    await expect(service.update(ME, 'm1', { labels: ['🔑'] })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(favorites.update).not.toHaveBeenCalled();
    expect(cards.toDtos).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('update: метки сохраняются, событие в той же транзакции', async () => {
    favorites.findRow.mockResolvedValue(makeRow('m1'));
    conversations.findMembership.mockResolvedValue({ userId: ME });
    favorites.update.mockResolvedValue({ ...makeRow('m1'), labels: ['🔑'] });
    cards.toDtos.mockResolvedValue([{ messageId: 'm1', labels: ['🔑'] }]);

    const card = await service.update(ME, 'm1', { labels: ['🔑'] });

    expect(card).toEqual({ messageId: 'm1', labels: ['🔑'] });
    expect(favorites.update).toHaveBeenCalledWith(ME, 'm1', { labels: ['🔑'] }, 'tx-handle');
    expect(eventBus.emit).toHaveBeenCalledWith(
      'tx-handle',
      'chat.favorite_updated',
      { userId: ME, conversationId: CONV, messageId: 'm1' },
      expect.objectContaining({ actorId: ME }),
    );
  });
});
