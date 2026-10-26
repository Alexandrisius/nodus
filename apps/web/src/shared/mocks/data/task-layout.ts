import type { TaskCardLayout, TaskListItem } from '@nodus/contracts';
import { defaultCreationForm, requiredCreateKeys } from '@nodus/contracts';

import { creationFormOf, mockTypes } from './process-types-store.js';

/** Состав карточки по типу (#432, Р7) — мок серверного `layout` детали:
 *  скрытые блоки, названия ролей и обязательные при создании поля. Сервер
 *  собирает его сам, поэтому он работает и для типа, невидимого зрителю. */
export function layoutOf(task: TaskListItem): TaskCardLayout {
  const type = mockTypes.find((entry) => entry.id === task.type.id);
  if (!type) return { hiddenBlocks: [], roleLabels: {}, requiredKeys: [] };
  return {
    hiddenBlocks: type.config.card.hiddenBlocks,
    roleLabels: type.config.card.roleLabels,
    requiredKeys: requiredCreateKeys(creationFormOf(type)),
  };
}

/** Обязательные ключи типа по коду (карточка задачи без живого типа). */
export const defaultRequiredKeys = requiredCreateKeys(defaultCreationForm('task'));
