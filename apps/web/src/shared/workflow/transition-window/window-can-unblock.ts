import type { TaskAccess, WorkflowTransition } from '@nodus/contracts';

import { canFixReason } from './window-conditions.js';

/**
 * Предикат маршрутизации кнопки (#380): заблокированную кнопку, которую
 * окно МОЖЕТ разблокировать этим актором, открываем окном, а не диалогом
 * отказа. Подзадачи и чек-лист окно не правит — остаётся прежний диалог.
 */
export function windowCanUnblock(
  transition: WorkflowTransition,
  access: Pick<TaskAccess, 'canEdit' | 'canLogTime' | 'canCheck'>,
): boolean {
  return (
    transition.blockedBy.length > 0 &&
    transition.blockedBy.every((reason) => canFixReason(reason, access))
  );
}

/** Маршрутизация кнопки: окно / прежний диалог причин / сразу. */
export type TransitionRoute = 'window' | 'dialog' | 'execute';

export function routeTransition(
  transition: WorkflowTransition,
  access: Pick<TaskAccess, 'canEdit' | 'canLogTime' | 'canCheck'>,
): TransitionRoute {
  if (transition.form !== null) return 'window';
  if (transition.blockedBy.length === 0) return 'execute';
  return windowCanUnblock(transition, access) ? 'window' : 'dialog';
}
