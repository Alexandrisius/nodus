import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispatchHandler } from './dispatch.handler.js';

/** Гейтинг повторов важного (#177): BullMQ-повтор ставится ТОЛЬКО
 *  requireAck-строке; важное без подтверждения — одно уведомление. */

const TX = 'tx-dispatch';

function makeEvent(
  snapshot: Record<string, unknown>,
  attempt = 0,
): Parameters<DispatchHandler['handle']>[0] {
  return {
    id: '77777777-7777-7777-7777-777777777777',
    type: 'notification.dispatch_requested',
    actorId: '88888888-8888-8888-8888-888888888888',
    payload: {
      snapshot: {
        notificationId: '99999999-9999-9999-9999-999999999999',
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        priority: 'urgent',
        kind: 'urgent.message',
        sourceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        conversationId: null,
        conversationTitle: null,
        messageId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        threadRootId: null,
        preview: 'Текст',
        ...snapshot,
      },
      attempt,
      seq: 1,
    },
    createdAt: '2026-10-04T00:00:00Z',
  } as never;
}

describe('DispatchHandler: гейтинг повторов (#177)', () => {
  const repo = { recordDelivery: vi.fn() };
  const repeats = { enqueue: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const featureFlags = { isEnabled: vi.fn() };
  let handler: DispatchHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlags.isEnabled.mockResolvedValue(true);
    handler = new DispatchHandler(
      repo as never,
      txRunner as never,
      repeats as never,
      featureFlags as never,
    );
  });

  it('requireAck=true — повторы ставятся', async () => {
    await handler.handle(makeEvent({ requireAck: true }));
    expect(repeats.enqueue).toHaveBeenCalledTimes(1);
  });

  it('requireAck=false — важное без повторов', async () => {
    await handler.handle(makeEvent({ requireAck: false }));
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });

  it('старые события без поля — повторов нет (undefined ≠ true)', async () => {
    await handler.handle(makeEvent({}));
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });

  it('повтор-попытка (attempt>0) — повторно не ставится', async () => {
    await handler.handle(makeEvent({ requireAck: true }, 2));
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });

  it('не-urgent — повторов нет', async () => {
    await handler.handle(makeEvent({ priority: 'high', requireAck: false }));
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });
});
