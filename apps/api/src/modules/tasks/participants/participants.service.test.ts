import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, type AuthUser } from '@nodus/contracts';

import { ParticipantsRepository } from './participants.repository.js';
import { ParticipantsService } from './participants.service.js';

const TX = { tx: true };
const user = (id: string) => ({ id, displayName: id, permissions: [] }) as unknown as AuthUser;
const ROW = {
  id: 't1',
  number: 7,
  title: 'T',
  creatorId: 'alice',
  assigneeId: 'bob',
  participants: [{ userId: 'carol', role: 'observer' }],
};

function setup(removed = 1) {
  const repo = { assignRole: vi.fn(), remove: vi.fn().mockResolvedValue(removed) };
  const tasksRepo = { findWithParticipants: vi.fn().mockResolvedValue(ROW), touch: vi.fn() };
  const query = {
    visibleRow: vi.fn().mockResolvedValue(ROW),
    detail: vi.fn().mockResolvedValue({ id: 't1' }),
  };
  const service = new ParticipantsService(
    { run: (fn: (tx: unknown) => unknown) => fn(TX) } as never,
    { emit: vi.fn() } as never,
    { prepare: vi.fn(), sync: vi.fn() } as never,
    query as never,
    { assertActiveUsers: vi.fn() } as never,
    tasksRepo as never,
    repo as never,
  );
  return { service, repo };
}

describe('ParticipantsService', () => {
  it('постановщик наблюдателем — конфликт (он и так видит задачу); соисполнителем — можно', async () => {
    const { service, repo } = setup();
    await expect(
      service.add(user('alice'), 't1', { userId: 'alice', role: 'observer' }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await service.add(user('alice'), 't1', { userId: 'alice', role: 'coexecutor' });
    expect(repo.assignRole).toHaveBeenCalledWith(TX, 't1', 'alice', 'coexecutor');
  });

  it('ответственный участником — конфликт', async () => {
    const { service } = setup();
    await expect(
      service.add(user('alice'), 't1', { userId: 'bob', role: 'coexecutor' }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it('снятие несуществующего участника менеджером — 404, не тихий успех', async () => {
    const { service } = setup(0);
    await expect(service.remove(user('alice'), 't1', 'dave')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('самоснятие не-наблюдателя — 403; наблюдатель снимается только в своей роли', async () => {
    const denied = setup(0);
    await expect(denied.service.remove(user('carol'), 't1', 'carol')).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    const ok = setup(1);
    await ok.service.remove(user('carol'), 't1', 'carol');
    expect(ok.repo.remove).toHaveBeenCalledWith(TX, 't1', 'carol', 'observer');
  });
});

describe('ParticipantsRepository.assignRole', () => {
  it('muted следует роли и при смене роли (наблюдатель → соисполнитель включает звук)', async () => {
    const upsert = vi.fn();
    const tx = { taskParticipant: { upsert } };
    await new ParticipantsRepository().assignRole(tx as never, 't1', 'carol', 'coexecutor');
    expect(upsert).toHaveBeenCalledWith({
      where: { taskId_userId: { taskId: 't1', userId: 'carol' } },
      update: { role: 'coexecutor', muted: false },
      create: { taskId: 't1', userId: 'carol', role: 'coexecutor', muted: false },
    });
    await new ParticipantsRepository().assignRole(tx as never, 't1', 'carol', 'observer');
    expect(upsert.mock.calls[1]![0].update).toEqual({ role: 'observer', muted: true });
  });
});
