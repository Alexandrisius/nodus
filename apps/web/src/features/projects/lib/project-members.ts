import type {
  ProjectMember,
  ProjectObserverKind,
  ProjectParticipantSource,
  UserRef,
} from '@nodus/contracts';

export interface ProjectMemberGroup {
  user: UserRef;
  /** Все источники участия сотрудника (руководство + задачи + ручной). */
  sources: ProjectParticipantSource[];
  /** Вид наблюдателя, если есть строка observer. */
  observerKind: ProjectObserverKind | null;
  joinedAt: string;
}

const SOURCE_ORDER: ProjectParticipantSource[] = [
  'manager',
  'assistant',
  'member',
  'task',
  'observer',
];

/** Группировка строк-источников по сотруднику (сервер отдаёт по строке на
 *  источник; человек может участвовать несколькими). Порядок источников —
 *  от сильнейшего к слабейшему, сотрудники — в порядке сервера. */
export function groupProjectMembers(rows: readonly ProjectMember[]): ProjectMemberGroup[] {
  const groups = new Map<string, ProjectMemberGroup>();
  for (const row of rows) {
    const existing = groups.get(row.user.id);
    if (existing) {
      if (!existing.sources.includes(row.source)) existing.sources.push(row.source);
      if (row.source === 'observer' && row.observerKind) existing.observerKind = row.observerKind;
      continue;
    }
    groups.set(row.user.id, {
      user: row.user,
      sources: [row.source],
      observerKind: row.source === 'observer' ? row.observerKind : null,
      joinedAt: row.joinedAt,
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    sources: [...group.sources].sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b)),
  }));
}

/** Ручной вид участия (секретный проект): member/observer — то, что можно
 *  снять; null — источник только из задач/руководства. */
export function manualMembershipKind(group: ProjectMemberGroup): 'member' | 'observer' | null {
  if (group.sources.includes('member')) return 'member';
  if (group.sources.includes('observer')) return 'observer';
  return null;
}
