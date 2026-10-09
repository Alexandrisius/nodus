import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { NotificationsService } from './notifications.service.js';

const USER = '33333333-3333-3333-3333-333333333333';
const CONV = '11111111-1111-1111-1111-111111111111';
const NOTIF_ID = '66666666-6666-6666-6666-666666666666';
const TX = 'tx-handle';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID,
    seq: 1n,
    user_id: USER,
    priority: 'high',
    kind: 'chat.direct_message',
    source_type: 'conversation',
    source_id: CONV,
    source_seq: 5n,
    actor_id: '22222222-2222-2222-2222-222222222222',
    preview: 'текст',
    urgent_text: null,
    conversation_id: CONV,
    conversation_title: null,
    message_id: '44444444-4444-4444-4444-444444444444',
    thread_root_id: null,
    created_at: new Date(),
    read_at: null,
    ack_at: null,
    repeats_stopped_at: null,
    ...overrides,
  };
}

describe('NotificationsService.readOne', () => {
  const repo = {
    readOne: vi.fn(),
    toDtos: vi.fn(),
  };
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
    repo.toDtos.mockImplementation(async (rows: unknown[]) => rows.map(() => ({ id: NOTIF_ID })));
  });

  it('переход в read эмитит notification.read (синк бейджа других устройств, D2)', async () => {
    repo.readOne.mockResolvedValue({ row: row({ read_at: new Date() }), changed: true });
    await service.readOne(USER, NOTIF_ID);
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      NOTIFICATION_EVENTS.READ,
      expect.objectContaining({ userId: USER, sourceId: CONV, notificationIds: [NOTIF_ID] }),
      expect.objectContaining({ aggregateType: 'notification' }),
    );
  });

  it('повторное чтение прочитанного (changed=false) — без эмитов', async () => {
    repo.readOne.mockResolvedValue({ row: row({ read_at: new Date() }), changed: false });
    await service.readOne(USER, NOTIF_ID);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('чужое/несуществующее — NOT_FOUND', async () => {
    repo.readOne.mockResolvedValue(null);
    await expect(service.readOne(USER, NOTIF_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
