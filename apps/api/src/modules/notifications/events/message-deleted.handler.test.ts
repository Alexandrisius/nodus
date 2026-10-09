import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { MessageDeletedHandler } from './message-deleted.handler.js';
import { NotificationsService } from '../notifications.service.js';

const CONV = '11111111-1111-1111-1111-111111111111';
const AUTHOR = '22222222-2222-2222-2222-222222222222';
const MSG = '44444444-4444-4444-4444-444444444444';
const EVENT_ID = '55555555-5555-5555-5555-555555555555';
const ALICE = '33333333-3333-3333-3333-333333333333';
const BOB = '77777777-7777-7777-7777-777777777777';
const TX = 'tx-handle';

function makeEvent(payload: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    type: 'chat.message_deleted',
    actorId: AUTHOR,
    payload: { conversationId: CONV, messageId: MSG, obliterated: true, ...payload },
    createdAt: '2026-10-09T00:00:00Z',
  } as never;
}

describe('MessageDeletedHandler', () => {
  const service = { purgeByMessage: vi.fn() };
  const featureFlags = { isEnabled: vi.fn() };
  let handler: MessageDeletedHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlags.isEnabled.mockResolvedValue(true);
    handler = new MessageDeletedHandler(service as never, featureFlags as never);
  });

  it('чистит журнал по message_id при удалении сообщения', async () => {
    await handler.handle(makeEvent());
    expect(service.purgeByMessage).toHaveBeenCalledWith(CONV, MSG);
  });

  it('флаг notifications выключен — тишина (чат жив)', async () => {
    featureFlags.isEnabled.mockResolvedValue(false);
    await handler.handle(makeEvent());
    expect(service.purgeByMessage).not.toHaveBeenCalled();
  });

  it('payload без messageId/conversationId — тихий пропуск', async () => {
    await handler.handle(makeEvent({ messageId: undefined }));
    await handler.handle(makeEvent({ conversationId: undefined }));
    expect(service.purgeByMessage).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.purgeByMessage', () => {
  const repo = { deleteByMessage: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const service = new NotificationsService(
    repo as never,
    txRunner as never,
    eventBus as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('удаляет строки и эмитит notification.read каждому затронутому пользователю', async () => {
    repo.deleteByMessage.mockResolvedValue([ALICE, BOB]);
    const affected = await service.purgeByMessage(CONV, MSG);
    expect(repo.deleteByMessage).toHaveBeenCalledWith(MSG, TX);
    expect(affected).toBe(2);
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      NOTIFICATION_EVENTS.READ,
      expect.objectContaining({ userId: ALICE, sourceId: CONV, notificationIds: null }),
      expect.objectContaining({ aggregateType: 'notification' }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      NOTIFICATION_EVENTS.READ,
      expect.objectContaining({ userId: BOB, sourceId: CONV }),
      expect.objectContaining({ aggregateType: 'notification' }),
    );
  });

  it('дедуп user_id: несколько строк одного пользователя — один эмит', async () => {
    repo.deleteByMessage.mockResolvedValue([ALICE, ALICE]);
    const affected = await service.purgeByMessage(CONV, MSG);
    expect(affected).toBe(1);
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('идемпотентно: нечего чистить — 0 эмитов', async () => {
    repo.deleteByMessage.mockResolvedValue([]);
    const affected = await service.purgeByMessage(CONV, MSG);
    expect(affected).toBe(0);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
