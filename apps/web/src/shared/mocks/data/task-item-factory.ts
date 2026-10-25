import type { CustomFieldValues, ProjectRef, TaskListItem } from '@nodus/contracts';

import { personalStageFor } from './personal-stages.js';

/** Фабрика демо-задач: id-схема, ссылки на проекты и сборка элемента с
 *  личным размещением — общая для ручного набора (`task-items.ts`) и
 *  объёмного генератора (`task-items-bulk.ts`). */

export const tid = (n: number): string => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const projectRefs = {
  p1: {
    id: '40000000-0000-4000-8000-000000000001',
    code: 'I001',
    name: 'I001-Внедрение цифровых информационных технологий',
    color: 'blue',
  },
  p2: {
    id: '40000000-0000-4000-8000-000000000002',
    code: 'I004',
    name: 'I004-Разработка плагина SmartCon',
    color: 'green',
  },
  p3: {
    id: '40000000-0000-4000-8000-000000000003',
    code: 'I005',
    name: 'I005-Внедрение Revit',
    color: 'amber',
  },
  p4: {
    id: '40000000-0000-4000-8000-000000000004',
    code: '0359',
    name: '0359-Главный корпус галургической фабрики',
    color: 'pink',
  },
} as const satisfies Record<string, ProjectRef>;

/** Личное размещение «Мой план» — из глобальной стадии (ADR-0008); явная
 *  колонка — для демонстрации вольных личных колонок того же состояния.
 *  Значения кастомных полей (#431) — необязательны: у большинства демо-задач
 *  их нет (`{}`), заполненные добавляются точечно. */
export function mk(
  task: Omit<TaskListItem, 'personalStageId' | 'customFields'> & {
    customFields?: CustomFieldValues;
  },
  personalStageId?: string,
): TaskListItem {
  return {
    ...task,
    customFields: task.customFields ?? {},
    personalStageId: personalStageId ?? personalStageFor(task.stage),
  };
}
