import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@nodus/contracts';

import { TaskCommentsCounter } from './comments-count.handler.js';

function setup(discussion: { taskId: string; count: number } | null, enabled = true) {
  const prisma = { task: { updateMany: vi.fn() } };
  const flags = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  const chat = { snapshot: vi.fn(), taskDiscussion: vi.fn().mockResolvedValue(discussion) };
  const counter = new TaskCommentsCounter(prisma as never, flags as never, chat);
  return { counter, prisma };
}

const event = (payload: Record<string, unknown>) =>
  ({ payload }) as unknown as DomainEvent<{ conversationId?: string }>;

describe('TaskCommentsCounter (#252)', () => {
  it('беседа задачи — commentsCount = пересчитанное число (не инкремент)', async () => {
    const { counter, prisma } = setup({ taskId: 't1', count: 4 });
    await counter.recount(event({ conversationId: 'c1' }));
    await counter.recount(event({ conversationId: 'c1' }));
    expect(prisma.task.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.task.updateMany).toHaveBeenLastCalledWith({
      where: { id: 't1' },
      data: { commentsCount: 4 },
    });
  });

  it('обычная беседа, флаг выключен или нет conversationId — без записи', async () => {
    const plain = setup(null);
    await plain.counter.recount(event({ conversationId: 'c1' }));
    expect(plain.prisma.task.updateMany).not.toHaveBeenCalled();

    const off = setup({ taskId: 't1', count: 1 }, false);
    await off.counter.recount(event({ conversationId: 'c1' }));
    expect(off.prisma.task.updateMany).not.toHaveBeenCalled();

    const bad = setup({ taskId: 't1', count: 1 });
    await bad.counter.recount(event({}));
    expect(bad.prisma.task.updateMany).not.toHaveBeenCalled();
  });
});
