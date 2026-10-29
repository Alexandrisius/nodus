import { Permission, type ProjectAccess, type ProjectMyMembership } from '@nodus/contracts';

/** Участие одного сотрудника в проекте (все источники, Р2). */
export interface MembershipRow {
  userId: string;
  source: string;
  observerKind: string | null;
}

/** Минимальные факты проекта для прав (без Prisma-типов). */
export interface ProjectFacts {
  managerId: string;
  assistantIds: readonly string[];
  visibility: 'open' | 'secret';
  status: 'active' | 'completed' | 'archived';
}

export function myMembership(rows: readonly MembershipRow[], userId: string): ProjectMyMembership {
  const mine = rows.filter((row) => row.userId === userId);
  return {
    manager: mine.some((row) => row.source === 'manager'),
    assistant: mine.some((row) => row.source === 'assistant'),
    participant: mine.some((row) => row.source === 'task' || row.source === 'member'),
    observer: mine.some((row) => row.source === 'observer'),
  };
}

export function isManagement(facts: ProjectFacts, userId: string): boolean {
  return facts.managerId === userId || facts.assistantIds.includes(userId);
}

/**
 * Права на проект (I8 — сервер истина). Управление полями/статусами —
 * руководство проекта (руководитель + помощники, вердикт 29.10) и
 * project.manage; состав — только у секретного; передача руководства и
 * закрытие в секретный — только действующий руководитель (допущения #52).
 */
export function projectAccess(
  facts: ProjectFacts,
  membership: ProjectMyMembership,
  permissions: readonly string[],
): ProjectAccess {
  const managePermission = permissions.includes(Permission.PROJECT_MANAGE);
  const manager = membership.manager;
  const canManage = manager || membership.assistant || managePermission;
  return {
    canManage,
    // Ручной состав: секретный — участники и наблюдатели; открытый — только
    // наблюдатели (участники живут из задач, вердикт 29.10 В2).
    canManageMembers: canManage,
    canJoin:
      facts.visibility === 'open' &&
      facts.status !== 'archived' &&
      !membership.manager &&
      !membership.assistant &&
      !membership.participant &&
      !membership.observer,
    canLeave: membership.observer && !membership.manager && !membership.assistant,
    canPostToChannel:
      manager || membership.assistant || permissions.includes(Permission.PROJECT_CHANNEL_POST),
    canTransfer: manager,
  };
}
