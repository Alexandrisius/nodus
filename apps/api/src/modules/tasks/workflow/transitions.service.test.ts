import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nodus/contracts';

import { TransitionsService } from './transitions.service.js';

const TX = { tx: true };
const USER = { id: 'bob', displayName: 'Боб', permissions: [] } as unknown as AuthUser;

describe('TransitionsService — сценарии API кнопок маршрута', () => {
  it('executeFor: видимость → личные маршруты держателей → переход в tx → строка списка', async () => {
    const order: string[] = [];
    const row = { id: 't1', creatorId: 'alice', assigneeId: 'bob', participants: [] };
    const query = {
      visibleRow: vi.fn(async () => (order.push('visible'), row)),
    };
    const placements = { prepare: vi.fn(async () => void order.push('prepare')) };
    const txRunner = {
      run: vi.fn(async (fn: (tx: unknown) => unknown) => (order.push('tx'), fn(TX))),
    };
    const taskService = { listItem: vi.fn(async () => (order.push('item'), { id: 't1' })) };
    const service = new TransitionsService(
      txRunner as never,
      {} as never,
      {} as never,
      placements as never,
      {} as never,
      query as never,
      taskService as never,
    );
    const execute = vi.spyOn(service, 'execute').mockResolvedValue({} as never);
    const item = await service.executeFor(USER, 't1', 'tr1', { override: true, reason: 'срочно' });
    expect(item).toEqual({ id: 't1' });
    expect(order).toEqual(['visible', 'prepare', 'tx', 'item']);
    expect(placements.prepare).toHaveBeenCalledWith(['alice', 'bob']);
    expect(execute).toHaveBeenCalledWith(
      TX,
      't1',
      USER,
      { transitionId: 'tr1' },
      { override: true, reason: 'срочно' },
    );
    expect(taskService.listItem).toHaveBeenCalledWith('bob', 't1');
  });

  it('listFor: чужая задача — 404 до транзакции', async () => {
    const txRunner = { run: vi.fn() };
    const service = new TransitionsService(
      txRunner as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { visibleRow: vi.fn().mockRejectedValue(new Error('404')) } as never,
      {} as never,
    );
    await expect(service.listFor(USER, 't1')).rejects.toThrow('404');
    expect(txRunner.run).not.toHaveBeenCalled();
  });
});
