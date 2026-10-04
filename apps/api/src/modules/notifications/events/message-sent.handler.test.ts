import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { MessageSentHandler } from './message-sent.handler.js';
import type { NotificationInsert } from '../notifications.repository.js';

const CONV = '11111111-1111-1111-1111-111111111111';
const AUTHOR = '22222222-2222-2222-2222-222222222222';
const ALICE = '33333333-3333-3333-3333-333333333333';
const MSG = '44444444-4444-4444-4444-444444444444';
const EVENT_ID = '55555555-5555-5555-5555-555555555555';
const NOTIF_ID = '66666666-6666-6666-6666-666666666666';
const TX = 'tx-handle';

function makeEvent(payload: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    type: 'chat.message_sent',
    actorId: AUTHOR,
    payload: {
      conversationId: CONV,
      messageId: MSG,
      seq: 5,
      authorId: AUTHOR,
      threadRootId: null,
      urgent: false,
      mentionedUserIds: [],
      message: { text: 'Привет' },
      ...payload,
    },
    createdAt: '2026-10-01T00:00:00Z',
  } as never;
}

const state = {
  type: 'group' as const,
  title: 'Проект',
  members: [
    { userId: AUTHOR, muted: false },
    { userId: ALICE, muted: false },
  ],
};

describe('MessageSentHandler', () => {
  const repo = {
    createFromEvent: vi.fn(),
    stopRepeats: vi.fn(),
  };
  const service = {
    conversationState: vi.fn(),
    threadWatcherIds: vi.fn(),
    buildInsertsFromMessageEvent: vi.fn(),
  };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const featureFlags = { isEnabled: vi.fn() };
  let handler: MessageSentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlags.isEnabled.mockResolvedValue(true);
    service.conversationState.mockResolvedValue(state);
    service.threadWatcherIds.mockResolvedValue([]);
    const insert: NotificationInsert = {
      id: NOTIF_ID,
      user_id: ALICE,
      priority: 'high',
      kind: 'chat.mention',
      source_type: 'conversation',
      source_id: CONV,
      source_seq: 5n,
      actor_id: AUTHOR,
      preview: 'Привет',
      urgent_text: null,
      conversation_id: CONV,
      conversation_title: 'Проект',
      message_id: MSG,
      thread_root_id: null,
      event_id: EVENT_ID,
    };
    service.buildInsertsFromMessageEvent.mockReturnValue([insert]);
    repo.createFromEvent.mockResolvedValue([
      {
        ...insert,
        seq: 1n,
        created_at: new Date(),
        read_at: null,
        ack_at: null,
        repeats_stopped_at: null,
      },
    ]);
    handler = new MessageSentHandler(
      service as never,
      repo as never,
      txRunner as never,
      eventBus as never,
      featureFlags as never,
      { setContext: vi.fn(), debug: vi.fn() } as never,
    );
  });

  it('создаёт журнал и эмитит dispatch на каждую созданную строку', async () => {
    await handler.handle(makeEvent());
    expect(repo.createFromEvent).toHaveBeenCalledTimes(1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      NOTIFICATION_EVENTS.DISPATCH_REQUESTED,
      expect.objectContaining({ attempt: 0, snapshot: expect.objectContaining({ userId: ALICE }) }),
      expect.objectContaining({ aggregateType: 'notification' }),
    );
  });

  it('D4: повторная доставка события (0 созданных) — эмитов нет', async () => {
    repo.createFromEvent.mockResolvedValue([]);
    await handler.handle(makeEvent());
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('G4: флаг notifications выключен — тишина (чат жив)', async () => {
    featureFlags.isEnabled.mockResolvedValue(false);
    await handler.handle(makeEvent());
    expect(repo.createFromEvent).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('C3: ответ автора останавливает его срочные повторы в беседе', async () => {
    await handler.handle(makeEvent());
    expect(repo.stopRepeats).toHaveBeenCalledWith(AUTHOR, { conversationId: CONV });
  });

  it('беседа исчезла — тихий выход без ошибки', async () => {
    service.conversationState.mockResolvedValue(null);
    await expect(handler.handle(makeEvent())).resolves.toBeUndefined();
    expect(repo.createFromEvent).not.toHaveBeenCalled();
  });

  it('A8: правка не проходит сюда — упоминания фиксируются отправкой (снапшот payload)', async () => {
    await handler.handle(makeEvent({ mentionedUserIds: [ALICE] }));
    const arg = service.buildInsertsFromMessageEvent.mock.calls[0]![0] as {
      payload: { mentionedUserIds: string[] };
    };
    expect(arg.payload.mentionedUserIds).toEqual([ALICE]);
  });
});
