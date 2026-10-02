import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { DEFAULT_CONVERSATION_PERMISSIONS } from '../permissions.js';
import { ConversationMembersService } from './conversation-members.service.js';
import { ConversationsService } from './conversations.service.js';

/**
 * Матрица прав на новых действиях беседы (#186, I8): гварды API — по
 * conversationPermissionsSchema (дефолты: changeInfo=admin, addMembers=member,
 * removeMembers=admin, manageSettings=owner). Ключевые приёмочные: member
 * НЕ может сменить аватарку/название, НО может добавить участника.
 */

const CONV = 'conv-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';
const MEMBER = 'member-1';
const PEER = 'peer-1';
const TX = 'tx-handle';

const JOINED = new Date('2026-09-01T09:00:00Z');

function makeRepo() {
  return {
    findMembership: vi.fn(),
    findTypeAndPermissions: vi.fn(async () => ({
      id: CONV,
      type: 'group',
      permissions: DEFAULT_CONVERSATION_PERMISSIONS,
    })),
    findListItem: vi.fn(),
    listMembers: vi.fn(async () => [
      membershipOf(OWNER, 'owner'),
      membershipOf(ADMIN, 'admin'),
      membershipOf(MEMBER, 'member'),
    ]),
    listMembersPage: vi.fn(async () => []),
    addMembers: vi.fn(async (_cid: string, ids: string[]) => ids),
    updateMemberRole: vi.fn(async () => true),
    removeMember: vi.fn(async () => true),
    updateTitle: vi.fn(async () => true),
    updateAvatar: vi.fn(async () => true),
  };
}

function membershipOf(userId: string, role: string) {
  return {
    conversationId: CONV,
    userId,
    role,
    lastReadSeq: 0n,
    lastReadAt: null,
    joinedAt: JOINED,
    pinned: false,
    muted: false,
    snoozed: false,
    hidden: false,
  };
}

function makeProfileReader() {
  return {
    findRefs: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, displayName: `Имя ${id}`, avatarUrl: null })),
    ),
    searchByDisplayName: vi.fn(async () => []),
    findMentionMatches: vi.fn(async () => []),
  };
}

function makeServices() {
  const repo = makeRepo();
  repo.findListItem.mockResolvedValue({ id: CONV });
  const items = {
    toItem: vi.fn(async (row: { id: string }) => ({ id: row.id })),
    toItems: vi.fn(),
  };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const avatars = { process: vi.fn(async () => ({ fileId: 'file-1' })) };
  const userProfiles = makeProfileReader();
  const conversations = new ConversationsService(
    repo as never,
    items as never,
    txRunner as never,
    eventBus as never,
    avatars as never,
    userProfiles as never,
  );
  const members = new ConversationMembersService(
    repo as never,
    items as never,
    txRunner as never,
    eventBus as never,
    userProfiles as never,
  );
  return { repo, eventBus, avatars, conversations, members, userProfiles };
}

describe('права матрицы: переименование и аватар (changeInfo=admin)', () => {
  let s: ReturnType<typeof makeServices>;
  beforeEach(() => {
    s = makeServices();
    vi.clearAllMocks();
  });

  it('member НЕ может переименовать — 403 FORBIDDEN', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(MEMBER, 'member'));
    await expect(
      s.conversations.updateInfo(MEMBER, CONV, { title: 'Новое' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('admin может переименовать — событие conversation_updated в той же tx', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(ADMIN, 'admin'));
    await s.conversations.updateInfo(ADMIN, CONV, { title: 'Новое' });
    expect(s.repo.updateTitle).toHaveBeenCalledWith(CONV, 'Новое', TX);
    expect(s.eventBus.emit).toHaveBeenCalledWith(
      TX,
      'chat.conversation_updated',
      { conversationId: CONV, title: 'Новое' },
      expect.anything(),
    );
  });

  it('member НЕ может сменить аватар — 403 (гвард до загрузки файла)', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(MEMBER, 'member'));
    await expect(
      s.conversations.setAvatar(MEMBER, CONV, { name: 'a.png', size: 10 }, Readable.from([])),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect(s.avatars.process).not.toHaveBeenCalled();
  });

  it('owner может сменить аватар — fileId деривата на беседе + событие', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(OWNER, 'owner'));
    await s.conversations.setAvatar(
      OWNER,
      CONV,
      { name: 'a.png', size: 10 },
      Readable.from([Buffer.from('x')]),
    );
    expect(s.avatars.process).toHaveBeenCalled();
    expect(s.repo.updateAvatar).toHaveBeenCalledWith(CONV, 'file-1', TX);
  });

  it('direct-беседу переименовать нельзя — VALIDATION_FAILED', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(OWNER, 'owner'));
    s.repo.findTypeAndPermissions.mockResolvedValue({
      id: CONV,
      type: 'direct',
      permissions: DEFAULT_CONVERSATION_PERMISSIONS,
    });
    await expect(s.conversations.updateInfo(OWNER, CONV, { title: 'Новое' })).rejects.toMatchObject(
      { code: ErrorCode.VALIDATION_FAILED },
    );
  });

  it('не-члену беседа не видна — 404 (не палить наличие)', async () => {
    s.repo.findMembership.mockResolvedValue(null);
    await expect(
      s.conversations.updateInfo(MEMBER, CONV, { title: 'Новое' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

describe('участники: addMembers=member, manageSettings=owner, removeMembers=admin', () => {
  let s: ReturnType<typeof makeServices>;
  beforeEach(() => {
    s = makeServices();
    vi.clearAllMocks();
  });

  it('member МОЖЕТ добавить участника (дефолт addMembers)', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(MEMBER, 'member'));
    s.userProfiles.findRefs.mockResolvedValue([{ id: PEER, displayName: 'Имя', avatarUrl: null }]);
    s.repo.findListItem.mockResolvedValue({ id: CONV });
    await s.members.add(MEMBER, CONV, { userIds: [PEER] });
    expect(s.repo.addMembers).toHaveBeenCalledWith(CONV, [PEER], TX);
    expect(s.eventBus.emit).toHaveBeenCalledWith(
      TX,
      'chat.member_added',
      { conversationId: CONV, userIds: [PEER], role: 'member' },
      expect.anything(),
    );
  });

  it('уже состоящих и неизвестных пропускает молча', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(MEMBER, 'member'));
    s.userProfiles.findRefs.mockResolvedValue([
      { id: 'ghost-known', displayName: 'Имя', avatarUrl: null },
    ]);
    s.repo.findListItem.mockResolvedValue({ id: CONV });
    await s.members.add(MEMBER, CONV, { userIds: [OWNER, 'ghost-known', 'unknown'] });
    expect(s.repo.addMembers).toHaveBeenCalledWith(CONV, ['ghost-known'], TX);
  });

  it('member НЕ может менять роли — manageSettings=owner', async () => {
    s.repo.findMembership.mockResolvedValue(membershipOf(MEMBER, 'member'));
    await expect(s.members.updateRole(MEMBER, CONV, PEER, { role: 'admin' })).rejects.toMatchObject(
      { code: ErrorCode.FORBIDDEN },
    );
  });

  it('owner назначает модератора — событие member_role_changed', async () => {
    s.repo.findMembership.mockImplementation(async (_cid: string, userId: string) =>
      userId === OWNER ? membershipOf(OWNER, 'owner') : membershipOf(PEER, 'member'),
    );
    await s.members.updateRole(OWNER, CONV, PEER, { role: 'admin' });
    expect(s.repo.updateMemberRole).toHaveBeenCalledWith(CONV, PEER, 'admin', TX);
    expect(s.eventBus.emit).toHaveBeenCalledWith(
      TX,
      'chat.member_role_changed',
      { conversationId: CONV, userId: PEER, role: 'admin', actorId: OWNER },
      expect.anything(),
    );
  });

  it('роль владельца не меняется никем', async () => {
    s.repo.findMembership.mockImplementation(async (_cid: string, userId: string) =>
      userId === OWNER ? membershipOf(OWNER, 'owner') : membershipOf(OWNER, 'owner'),
    );
    await expect(
      s.members.updateRole(OWNER, CONV, OWNER, { role: 'member' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('admin исключает участника (иерархия admin > member)', async () => {
    s.repo.findMembership.mockImplementation(async (_cid: string, userId: string) =>
      userId === ADMIN ? membershipOf(ADMIN, 'admin') : membershipOf(PEER, 'member'),
    );
    await s.members.remove(ADMIN, CONV, PEER);
    expect(s.eventBus.emit).toHaveBeenCalledWith(
      TX,
      'chat.member_removed',
      { conversationId: CONV, userId: PEER, actorId: ADMIN },
      expect.anything(),
    );
  });

  it('admin НЕ может исключить модератора (равный ранг) — только владелец', async () => {
    s.repo.findMembership.mockImplementation(async (_cid: string, userId: string) =>
      userId === ADMIN ? membershipOf(ADMIN, 'admin') : membershipOf(PEER, 'admin'),
    );
    await expect(s.members.remove(ADMIN, CONV, PEER)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
  });

  it('владельца исключить нельзя', async () => {
    s.repo.findMembership.mockImplementation(async (_cid: string, userId: string) =>
      userId === ADMIN ? membershipOf(ADMIN, 'admin') : membershipOf(OWNER, 'owner'),
    );
    await expect(s.members.remove(ADMIN, CONV, OWNER)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
  });

  it('member НЕ может исключать — removeMembers=admin', async () => {
    s.repo.findMembership.mockImplementation(async (_cid: string, userId: string) =>
      userId === MEMBER ? membershipOf(MEMBER, 'member') : membershipOf(PEER, 'member'),
    );
    await expect(s.members.remove(MEMBER, CONV, PEER)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    expect(DomainException).toBeDefined();
  });
});
