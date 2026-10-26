import { useMemo } from 'react';
import type { CreationFieldKey, TaskCardBlock, TaskDetail, TaskRoleKey } from '@nodus/contracts';
import { taskLayoutOf, ui } from '@nodus/contracts';

/**
 * Состав карточки по типу (#432, Р7): сервер отдаёт `layout` в детали задачи
 * (скрытые блоки, названия ролей, обязательные при создании поля) — веб
 * только прячет и переименовывает. Состав карточки — представление, а не
 * права: скрытый блок не ограничивает доступ. Работает и для типа,
 * невидимого зрителю: layout собрал сервер. Геометрия ряда — отдельный
 * `task-card-layout.ts` (#365), здесь — только представление по типу.
 */
export interface TaskCardLayoutView {
  blockVisible: (block: TaskCardBlock) => boolean;
  roleLabel: (role: TaskRoleKey) => string;
  /** Обязательное при создании поле: очищать в карточке нельзя (Р5). */
  isRequired: (key: CreationFieldKey) => boolean;
}

const ROLE_DEFAULT: Record<TaskRoleKey, string> = {
  creator: ui.tasks.creator,
  assignee: ui.tasks.assignee,
  coexecutor: ui.tasks.participants,
  observer: ui.tasks.watchers,
};

export function useTaskCardLayout(
  task: Pick<TaskDetail, 'layout'> | null | undefined,
): TaskCardLayoutView {
  const raw = task?.layout;
  return useMemo(() => {
    const layout = taskLayoutOf({ layout: raw });
    const hidden = new Set(layout?.hiddenBlocks ?? []);
    const required = new Set(layout?.requiredKeys ?? []);
    const labels = layout?.roleLabels ?? {};
    return {
      blockVisible: (block) => !hidden.has(block),
      roleLabel: (role) => labels[role] ?? ROLE_DEFAULT[role],
      isRequired: (key) => required.has(key),
    };
  }, [raw]);
}
