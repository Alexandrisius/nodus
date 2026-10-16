import { describe, expect, it, vi } from 'vitest';
import { TASK_EVENTS, type DomainEvent } from '@nodus/contracts';

import { TaskCommentsCounter } from './comments-count.handler.js';

const TX = {
  task: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

function setup(discussion: { taskId: string; count: number } | null, enabled = true) {
  TX.task.findFirst.mockReset().mockResolvedValue({
    id: 't1',
    number: 7,
    creatorId: 'alice',
    assigneeId: 'bob',
    participants: [{ userId: 'carol', role: 'observer' }],
  });
  TX.task.update.mockReset();
  const txRunner = { run: (fn: (tx: unknown) => unknown) => fn(TX) };
  const eventBus = { emit: vi.fn() };
  const flags = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  const chat = { snapshot: vi.fn(), taskDiscussion: vi.fn().mockResolvedValue(discussion) };
  const counter = new TaskCommentsCounter(
    txRunner as never,
    eventBus as never,
    flags as never,
    chat,
  );
  return { counter, eventBus };
}

const event = (payload: Record<string, unknown>) =>
  ({ payload, actorId: 'alice' }) as unknown as DomainEvent<{ conversationId?: string }>;

describe('TaskCommentsCounter (#252)', () => {
  it('беседа задачи — пересчитанное число (не инкремент) и task.comments_counted участникам', async () => {
    const { counter, eventBus } = setup({ taskId: 't1', count: 4 });
    await counter.recount(event({ conversationId: 'c1' }));
    await counter.recount(event({ conversationId: 'c1' }));
    expect(TX.task.update).toHaveBeenCalledTimes(2);
    expect(TX.task.update).toHaveBeenLastCalledWith({
      where: { id: 't1' },
      data: { commentsCount: 4 },
    });
    expect(eventBus.emit).toHaveBeenLastCalledWith(
      TX,
      TASK_EVENTS.COMMENTS_COUNTED,
      { taskId: 't1', number: 7, audience: ['alice', 'bob', 'carol'], commentsCount: 4 },
      expect.objectContaining({ aggregateType: 'task', aggregateId: 't1' }),
    );
  });

  it('обычная беседа, флаг выключен или нет conversationId — без записи', async () => {
    const plain = setup(null);
    await plain.counter.recount(event({ conversationId: 'c1' }));
    expect(TX.task.update).not.toHaveBeenCalled();

    const off = setup({ taskId: 't1', count: 1 }, false);
    await off.counter.recount(event({ conversationId: 'c1' }));
    expect(TX.task.update).not.toHaveBeenCalled();

    const bad = setup({ taskId: 't1', count: 1 });
    await bad.counter.recount(event({}));
    expect(TX.task.update).not.toHaveBeenCalled();
    expect(bad.eventBus.emit).not.toHaveBeenCalled();
  });
});
