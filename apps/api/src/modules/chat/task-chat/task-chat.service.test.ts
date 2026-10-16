import { describe, expect, it, vi } from 'vitest';
import { CHAT_EVENTS } from '@nodus/contracts';

import type { TaskChatReader } from '../../tasks/ports/task-chat-reader.port.js';
import type { TaskChatRepository } from './task-chat.repository.js';
import { TaskChatService } from './task-chat.service.js';

const TX = { tx: true };
const TASK = 'task-1';
const CONV = 'conv-1';

function setup(opts: {
  roster: Awaited<ReturnType<TaskChatReader['roster']>>;
  created?: boolean;
  current?: string[];
  canView?: boolean;
}) {
  const repo = {
    findOrCreate: vi.fn().mockResolvedValue({ id: CONV, created: opts.created ?? false }),
    lock: vi.fn(),
    members: vi.fn().mockResolvedValue(opts.current ?? []),
    addMembers: vi.fn(async (_tx, _id, rows: { userId: string }[]) => rows.map((r) => r.userId)),
    removeMembers: vi.fn(),
    find: vi.fn().mockResolvedValue(CONV),
  };
  const eventBus = { emit: vi.fn() };
  const reader: TaskChatReader = {
    roster: vi.fn().mockResolvedValue(opts.roster),
    refs: vi.fn(),
    canView: vi.fn().mockResolvedValue(opts.canView ?? true),
  };
  const txRunner = { run: (fn: (tx: unknown) => unknown) => fn(TX) };
  const service = new TaskChatService(
    repo as unknown as TaskChatRepository,
    txRunner as never,
    eventBus as never,
    reader,
  );
  return { service, repo, eventBus };
}

const roster = {
  creatorId: 'alice',
  members: [
    { userId: 'alice', muted: false },
    { userId: 'bob', muted: false },
    { userId: 'carol', muted: true },
  ],
};

describe('TaskChatService.sync (#252)', () => {
  it('новая беседа: постановщик — owner, наблюдатель без звука, conversation_created', async () => {
    const { service, repo, eventBus } = setup({ roster, created: true });
    await expect(service.sync(TASK, 'alice')).resolves.toBe(CONV);
    expect(repo.addMembers).toHaveBeenCalledWith(TX, CONV, [
      { userId: 'alice', role: 'owner', muted: false },
      { userId: 'bob', role: 'member', muted: false },
      { userId: 'carol', role: 'member', muted: true },
    ]);
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      CHAT_EVENTS.CONVERSATION_CREATED,
      expect.objectContaining({
        conversationId: CONV,
        type: 'task',
        memberIds: ['alice', 'bob', 'carol'],
      }),
      expect.anything(),
    );
  });

  it('существующая: добавляет новых, убирает выбывших, состав совпал — без событий', async () => {
    const { service, repo, eventBus } = setup({ roster, current: ['alice', 'bob', 'dave'] });
    await service.sync(TASK, 'alice');
    expect(repo.addMembers).toHaveBeenCalledWith(TX, CONV, [
      { userId: 'carol', role: 'member', muted: true },
    ]);
    expect(repo.removeMembers).toHaveBeenCalledWith(TX, CONV, ['dave']);
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      CHAT_EVENTS.MEMBER_ADDED,
      { conversationId: CONV, userIds: ['carol'], role: 'member' },
      expect.anything(),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      CHAT_EVENTS.MEMBER_REMOVED,
      { conversationId: CONV, userId: 'dave', actorId: 'alice' },
      expect.anything(),
    );

    const same = setup({ roster, current: ['alice', 'bob', 'carol'] });
    await same.service.sync(TASK, 'alice');
    expect(same.eventBus.emit).not.toHaveBeenCalled();
  });

  it('задача удалена — состав беседы распускается, новая не создаётся', async () => {
    const { service, repo, eventBus } = setup({ roster: null, current: ['alice', 'bob'] });
    await expect(service.sync(TASK, 'alice')).resolves.toBeNull();
    expect(repo.findOrCreate).not.toHaveBeenCalled();
    expect(repo.removeMembers).toHaveBeenCalledWith(TX, CONV, ['alice', 'bob']);
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
  });

  it('openForUser: невидимая задача — 404 до синхронизации', async () => {
    const { service, repo } = setup({ roster, canView: false });
    await expect(service.openForUser(TASK, { id: 'eve', permissions: [] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.findOrCreate).not.toHaveBeenCalled();
  });
});
