import { describe, expect, it, vi } from 'vitest';

import type { TransactionClient } from '../database/transaction-runner.js';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('emit пишет событие в outbox через переданную транзакцию', async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = { event: { create } } as unknown as TransactionClient;
    const bus = new EventBus();

    await bus.emit(tx, 'task.created', {
      actorId: 'u1',
      aggregateType: 'task',
      aggregateId: 't1',
      payload: { id: 't1', title: 'Задача' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        type: 'task.created',
        actorId: 'u1',
        aggregateType: 'task',
        aggregateId: 't1',
        payload: { id: 't1', title: 'Задача' },
      },
    });
  });

  it('системное событие — actorId null по умолчанию', async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = { event: { create } } as unknown as TransactionClient;
    await new EventBus().emit(tx, 'workflow.escalated', { payload: { id: 'w1' } });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: null }),
    });
  });
});
