import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import {
  isManagement,
  myMembership,
  projectAccess,
  type MembershipRow,
  type ProjectFacts,
} from './project-access.js';

const MANAGER = '00000000-0000-4000-8000-000000000001';
const ASSISTANT = '00000000-0000-4000-8000-000000000002';
const WORKER = '00000000-0000-4000-8000-000000000003';
const OBSERVER = '00000000-0000-4000-8000-000000000004';
const OUTSIDER = '00000000-0000-4000-8000-000000000005';

const facts = (overrides: Partial<ProjectFacts> = {}): ProjectFacts => ({
  managerId: MANAGER,
  assistantIds: [ASSISTANT],
  visibility: 'open',
  status: 'active',
  ...overrides,
});

const rows = (...sources: MembershipRow['source'][]): MembershipRow[] =>
  sources.map((source) => ({ userId: sourceUser(source), source, observerKind: null }));

function sourceUser(source: MembershipRow['source']): string {
  switch (source) {
    case 'manager':
      return MANAGER;
    case 'assistant':
      return ASSISTANT;
    case 'task':
    case 'member':
      return WORKER;
    default:
      return OBSERVER;
  }
}

describe('myMembership (#52, Р2)', () => {
  it('каждый источник поднимает своё поле; task и member — оба participant', () => {
    const all = [
      { userId: MANAGER, source: 'manager', observerKind: null },
      { userId: WORKER, source: 'task', observerKind: null },
      { userId: WORKER, source: 'member', observerKind: null },
      { userId: OBSERVER, source: 'observer', observerKind: 'joined' },
    ];
    expect(myMembership(all, MANAGER)).toEqual({
      manager: true,
      assistant: false,
      participant: false, // руководство — не «участник» в узком смысле Р2
      observer: false,
    });
    expect(myMembership(all, WORKER)).toMatchObject({ participant: true, observer: false });
    expect(myMembership(all, OBSERVER)).toMatchObject({ participant: false, observer: true });
  });

  it('один человек может быть одновременно участником и наблюдателем (несколько источников)', () => {
    const both: MembershipRow[] = [
      { userId: WORKER, source: 'observer', observerKind: 'joined' },
      { userId: WORKER, source: 'task', observerKind: null },
    ];
    expect(myMembership(both, WORKER)).toEqual({
      manager: false,
      assistant: false,
      participant: true,
      observer: true,
    });
  });

  it('без строк — все флаги false', () => {
    expect(myMembership([], OUTSIDER)).toEqual({
      manager: false,
      assistant: false,
      participant: false,
      observer: false,
    });
  });
});

describe('isManagement', () => {
  it('руководитель и помощник — да; исполнитель задачи — нет', () => {
    const f = facts();
    expect(isManagement(f, MANAGER)).toBe(true);
    expect(isManagement(f, ASSISTANT)).toBe(true);
    expect(isManagement(f, WORKER)).toBe(false);
  });
});

describe('projectAccess (#52, вердикты 29.10)', () => {
  it('руководитель: всё, включая передачу; помощник: управление без передачи', () => {
    const f = facts();
    const manager = projectAccess(f, myMembership(rows('manager'), MANAGER), []);
    expect(manager).toMatchObject({
      canManage: true,
      canManageMembers: true, // открытый: ручные НАБЛЮДАТЕЛИ (участники — из задач)
      canJoin: false,
      canLeave: false,
      canPostToChannel: true,
      canTransfer: true,
    });
    const assistant = projectAccess(f, myMembership(rows('assistant'), ASSISTANT), []);
    expect(assistant).toMatchObject({
      canManage: true,
      canTransfer: false,
      canPostToChannel: true,
    });
  });

  it('секретный проект: руководство управляет составом; участники — нет', () => {
    const f = facts({ visibility: 'secret' });
    const manager = projectAccess(f, myMembership(rows('manager'), MANAGER), []);
    expect(manager.canManageMembers).toBe(true);
    const worker = projectAccess(f, myMembership(rows('member'), WORKER), []);
    expect(worker).toMatchObject({ canManage: false, canManageMembers: false, canTransfer: false });
  });

  it('join: только открытый действующий проект и полный не-участник', () => {
    const open = facts();
    expect(projectAccess(open, myMembership([], OUTSIDER), []).canJoin).toBe(true);
    // любая роль в проекте блокирует вступление
    for (const source of ['manager', 'assistant', 'task', 'observer'] as const) {
      const userId = sourceUser(source);
      const membership = myMembership([{ userId, source, observerKind: null }], userId);
      expect(projectAccess(open, membership, []).canJoin).toBe(false);
    }
    // архивный и секретный — нельзя
    expect(
      projectAccess(facts({ status: 'archived' }), myMembership([], OUTSIDER), []).canJoin,
    ).toBe(false);
    expect(
      projectAccess(facts({ visibility: 'secret' }), myMembership([], OUTSIDER), []).canJoin,
    ).toBe(false);
  });

  it('leave: только наблюдатель без роли руководства', () => {
    const open = facts();
    expect(projectAccess(open, myMembership(rows('observer'), OBSERVER), []).canLeave).toBe(true);
    // наблюдатель, ставший руководителем, покинуть проект не может
    const managerObserver = myMembership(
      [
        { userId: MANAGER, source: 'manager', observerKind: null },
        { userId: MANAGER, source: 'observer', observerKind: 'joined' },
      ],
      MANAGER,
    );
    expect(projectAccess(open, managerObserver, []).canLeave).toBe(false);
    expect(projectAccess(open, myMembership(rows('task'), WORKER), []).canLeave).toBe(false);
  });

  it('канал: пишет руководство и держатели project.channel.post; участник — нет', () => {
    const f = facts();
    expect(projectAccess(f, myMembership(rows('task'), WORKER), []).canPostToChannel).toBe(false);
    const holder = projectAccess(f, myMembership([], OUTSIDER), [Permission.PROJECT_CHANNEL_POST]);
    expect(holder.canPostToChannel).toBe(true);
    // наблюдатель с правом тоже пишет
    const observerHolder = projectAccess(f, myMembership(rows('observer'), OBSERVER), [
      Permission.PROJECT_CHANNEL_POST,
    ]);
    expect(observerHolder.canPostToChannel).toBe(true);
  });

  it('project.manage равен управлению, но не передаче; состав — да', () => {
    const admin = projectAccess(facts(), myMembership([], OUTSIDER), [Permission.PROJECT_MANAGE]);
    expect(admin).toMatchObject({ canManage: true, canTransfer: false, canManageMembers: true });
    const adminSecret = projectAccess(facts({ visibility: 'secret' }), myMembership([], OUTSIDER), [
      Permission.PROJECT_MANAGE,
    ]);
    expect(adminSecret.canManageMembers).toBe(true);
  });
});
