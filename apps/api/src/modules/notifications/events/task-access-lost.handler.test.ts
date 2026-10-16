import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@nodus/contracts';

import { TaskAccessLostWriter } from './task-access-lost.handler.js';

const event = (payload: Record<string, unknown>) => ({ payload }) as unknown as DomainEvent<never>;

function setup(roster: { creatorId: string; members: { userId: string }[] } | null) {
  const service = { purgeBySourceForUsers: vi.fn().mockResolvedValue(0) };
  const flags = { isEnabled: vi.fn().mockResolvedValue(true) };
  const tasks = { roster: vi.fn().mockResolvedValue(roster) };
  const writer = new TaskAccessLostWriter(service as never, flags as never, tasks as never);
  return { writer, service, tasks };
}

describe('TaskAccessLostWriter (#311)', () => {
  it('снятый участник и прежний ответственный вне состава — их уведомления удаляются', async () => {
    const { writer, service } = setup({ creatorId: 'c', members: [{ userId: 'a2' }] });
    await writer.handle(event({ taskId: 't1', removed: ['u1'], previousAssigneeId: 'a1' }));
    expect(service.purgeBySourceForUsers).toHaveBeenCalledWith('task', 't1', ['u1', 'a1']);
  });

  it('оставшийся в составе (смена роли, постановщик) — не трогаем', async () => {
    const { writer, service } = setup({ creatorId: 'a1', members: [{ userId: 'u1' }] });
    await writer.handle(event({ taskId: 't1', removed: ['u1'], previousAssigneeId: 'a1' }));
    expect(service.purgeBySourceForUsers).toHaveBeenCalledWith('task', 't1', []);
  });

  it('без кандидатов — порт не читается', async () => {
    const { writer, tasks, service } = setup(null);
    await writer.handle(event({ taskId: 't1', removed: [], previousAssigneeId: null }));
    expect(tasks.roster).not.toHaveBeenCalled();
    expect(service.purgeBySourceForUsers).not.toHaveBeenCalled();
  });
});
