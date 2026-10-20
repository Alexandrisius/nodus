import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nodus/contracts';

import { TransitionsService } from './transitions.service.js';

const TX = { tx: true };
const USER = { id: 'bob', displayName: 'Боб', permissions: [] } as unknown as AuthUser;

function makeService(
  deps: Partial<
    Record<
      'txRunner' | 'workflows' | 'tasks' | 'placements' | 'query' | 'taskService' | 'mover',
      unknown
    >
  >,
) {
  return new TransitionsService(
    (deps.txRunner ?? {}) as never,
    (deps.workflows ?? {}) as never,
    (deps.tasks ?? {}) as never,
    (deps.placements ?? {}) as never,
    (deps.query ?? {}) as never,
    (deps.taskService ?? {}) as never,
    (deps.mover ?? {}) as never,
  );
}

describe('TransitionsService — сценарии API кнопок маршрута', () => {
  it('executeFor: видимость → личные маршруты → переход и НОВЫЕ кнопки в одной tx → строка', async () => {
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
    const service = makeService({ txRunner, placements, query, taskService });
    const execute = vi.spyOn(service, 'execute').mockResolvedValue({} as never);
    const available = vi.spyOn(service, 'available').mockResolvedValue([{ id: 'next' }] as never);
    const result = await service.executeFor(USER, 't1', 'tr1', {
      override: true,
      reason: 'срочно',
    });
    expect(result).toEqual({ task: { id: 't1' }, transitions: [{ id: 'next' }] });
    expect(available).toHaveBeenCalledWith(TX, 't1', USER);
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
    const service = makeService({
      txRunner,
      query: { visibleRow: vi.fn().mockRejectedValue(new Error('404')) },
    });
    await expect(service.listFor(USER, 't1')).rejects.toThrow('404');
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  it('available: кнопки несут показ и итог цели (#378)', async () => {
    const target = {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Завершена',
      systemState: 'closed',
      outcome: 'success',
    };
    const workflows = {
      load: vi.fn(async () => ({
        id: 'wf',
        stages: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            code: null,
            name: 'В работе',
            systemState: 'active',
            archivedAt: null,
            workflowId: 'wf',
            color: 'success',
            sortOrder: 0,
            isInitial: false,
            outcome: null,
          },
          target,
        ],
        transitions: [
          {
            id: '00000000-0000-4000-8000-000000000011',
            name: 'Завершить',
            fromStageId: '00000000-0000-4000-8000-000000000001',
            toStageId: target.id,
            display: 'primary',
            sortOrder: 0,
            rules: { conditions: [], validators: [], postFunctions: [] },
          },
        ],
      })),
    };
    const tasks = {
      lock: vi.fn(),
      findWithParticipants: vi.fn(async () => ({
        id: 't1',
        number: 1,
        stageId: '00000000-0000-4000-8000-000000000001',
        systemState: 'active',
        creatorId: 'alice',
        assigneeId: 'bob',
        completedAt: null,
        participants: [],
      })),
      gateFacts: vi.fn(async () => ({
        stageId: '00000000-0000-4000-8000-000000000001',
        acceptRequired: false,
        creatorIsAssignee: false,
        openSubtasks: 0,
        reviewSubtasks: 0,
        checklistDone: 0,
        checklistTotal: 0,
        spentMinutes: 0,
        description: '',
        deadline: null,
        assigneeId: 'bob',
        plannedMinutes: null,
        hasResult: false,
      })),
    };
    const service = makeService({ workflows, tasks });
    const buttons = await service.available(TX as never, 't1', { id: 'bob', permissions: [] });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({
      display: 'primary',
      toStageOutcome: 'success',
      toStageState: 'closed',
    });

    // Обход гейта: причина уходит в событие (история/аудит, ADR-0020).
    workflows.load.mockResolvedValueOnce({
      ...(await workflows.load()),
      transitions: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          name: 'Завершить',
          fromStageId: '00000000-0000-4000-8000-000000000001',
          toStageId: target.id,
          display: 'primary',
          sortOrder: 0,
          rules: {
            conditions: [],
            validators: [{ kind: 'result_present' }],
            postFunctions: [],
          } as never,
        },
      ],
    });
    const mover = { apply: vi.fn(async () => void 0) };
    const gated = makeService({ workflows, tasks, mover });
    await gated.execute(
      TX as never,
      't1',
      { id: 'bob', permissions: ['task.override_gate'] },
      { transitionId: '00000000-0000-4000-8000-000000000011' },
      { override: true, reason: '  срочно  ' },
    );
    expect(mover.apply).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ id: 't1' }),
      expect.objectContaining({ id: target.id }),
      'bob',
      expect.objectContaining({
        cause: 'transition',
        overridden: ['result_present'],
        overrideReason: 'срочно',
      }),
    );
  });
});
