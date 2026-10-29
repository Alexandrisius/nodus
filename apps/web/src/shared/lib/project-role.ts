import type { ProjectMyMembership } from '@nodus/contracts';

/** Роль в проекте (фильтр «Моя роль» и чип журнала). */
export type ProjectRole = 'manager' | 'assistant' | 'participant' | 'observer';

/** Сильнейший источник участия: руководитель → помощник → участник →
 *  наблюдатель; null — не участвую. */
export function primaryProjectRole(membership: ProjectMyMembership): ProjectRole | null {
  if (membership.manager) return 'manager';
  if (membership.assistant) return 'assistant';
  if (membership.participant) return 'participant';
  if (membership.observer) return 'observer';
  return null;
}
