import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispatchHandler } from './dispatch.handler.js';

/** Повторы важного (#177, ревизия модели 05.10): BullMQ-повторы ставятся
 *  КАЖДОМУ urgent-уведомлению при первой доставке (5 мин × 12 до часа);
 *  гасит прочтение/ответ/реакция или потолок (стоп-повторы в репозитории). */

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
    createdAt: '2026-10-05T00:00:00Z',
  } as never;
}

describe('DispatchHandler: повторы важного (#177)', () => {
  const repo = { recordDelivery: vi.fn(), findById: vi.fn() };
  const repeats = { enqueue: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const featureFlags = { isEnabled: vi.fn() };
  let handler: DispatchHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    featureFlags.isEnabled.mockResolvedValue(true);
    repo.findById.mockResolvedValue({ id: '99999999-9999-9999-9999-999999999999' });
    handler = new DispatchHandler(
      repo as never,
      txRunner as never,
      repeats as never,
      featureFlags as never,
    );
  });

  it('urgent при первой доставке — повторы ставятся', async () => {
    await handler.handle(makeEvent({}));
    expect(repeats.enqueue).toHaveBeenCalledTimes(1);
  });

  it('повтор-попытка (attempt>0) — повторно не ставится', async () => {
    await handler.handle(makeEvent({}, 2));
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });

  it('не-urgent — повторов нет', async () => {
    await handler.handle(makeEvent({ priority: 'high' }));
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });

  it('#267: строка вычищена (удалённое сообщение) — тихий пропуск без доставки', async () => {
    repo.findById.mockResolvedValue(null);
    await handler.handle(makeEvent({}));
    expect(repo.recordDelivery).not.toHaveBeenCalled();
    expect(repeats.enqueue).not.toHaveBeenCalled();
  });
});
