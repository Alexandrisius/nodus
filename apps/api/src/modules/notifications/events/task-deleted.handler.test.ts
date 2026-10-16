import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@nodus/contracts';

import { TaskDeletedNotifyHandler } from './task-deleted.handler.js';

const event = (payload: Record<string, unknown>) =>
  ({ payload }) as unknown as DomainEvent<{ taskId?: string }>;

describe('TaskDeletedNotifyHandler (#252)', () => {
  it('удалённая задача — журнал чистится по источнику task', async () => {
    const service = { purgeBySource: vi.fn() };
    const flags = { isEnabled: vi.fn().mockResolvedValue(true) };
    await new TaskDeletedNotifyHandler(service as never, flags as never).handle(
      event({ taskId: 't1' }),
    );
    expect(service.purgeBySource).toHaveBeenCalledWith('task', 't1');
  });

  it('флаг выключен или нет taskId — без чистки', async () => {
    const service = { purgeBySource: vi.fn() };
    await new TaskDeletedNotifyHandler(
      service as never,
      {
        isEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    ).handle(event({ taskId: 't1' }));
    await new TaskDeletedNotifyHandler(
      service as never,
      {
        isEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    ).handle(event({}));
    expect(service.purgeBySource).not.toHaveBeenCalled();
  });
});
