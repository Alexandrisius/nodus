import { Permission, type TaskAccess, type TaskActorRole } from '@nodus/contracts';

/**
 * Права на задачу (мини-спека #37) — чистые функции над ролями актора.
 * Видимость (кто вообще видит задачу) — task-visibility.ts; здесь — что
 * видящий может с ней делать. Сервер — истина (I8), DTO отдаёт `access`.
 */

export interface TaskRoleFacts {
  creatorId: string;
  assigneeId: string;
  participants: readonly { userId: string; role: string }[];
}

export function actorRoles(task: TaskRoleFacts, userId: string): Set<TaskActorRole> {
  const roles = new Set<TaskActorRole>();
  if (task.creatorId === userId) roles.add('creator');
  if (task.assigneeId === userId) roles.add('assignee');
  for (const p of task.participants) {
    if (p.userId === userId && (p.role === 'coexecutor' || p.role === 'observer')) {
      roles.add(p.role);
    }
  }
  return roles;
}

export function taskAccess(
  roles: ReadonlySet<TaskActorRole>,
  permissions: readonly string[],
): TaskAccess {
  const manageAny = permissions.includes(Permission.TASK_MANAGE_ANY);
  const owner = roles.has('creator') || roles.has('assignee') || manageAny;
  const worker = roles.has('assignee') || roles.has('coexecutor') || manageAny;
  return {
    canEdit: owner,
    canManageParticipants: owner,
    canLogTime: worker,
    canCheck: owner || roles.has('coexecutor'),
    canDelete: roles.has('creator') || manageAny,
  };
}

/** Пользователи, у которых задача лежит в «Моём плане»: постановщик,
 *  ответственный, соисполнители (наблюдатели — фильтром «по участию»). */
export function planHolderIds(task: TaskRoleFacts): string[] {
  const ids = new Set([task.creatorId, task.assigneeId]);
  for (const p of task.participants) if (p.role === 'coexecutor') ids.add(p.userId);
  return [...ids];
}

/** Адресаты событий задачи: все участники, включая наблюдателей. */
export function audienceIds(task: TaskRoleFacts, extra: readonly string[] = []): string[] {
  return [
    ...new Set([
      task.creatorId,
      task.assigneeId,
      ...task.participants.map((p) => p.userId),
      ...extra,
    ]),
  ];
}
