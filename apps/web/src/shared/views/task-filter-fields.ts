import { useMemo } from 'react';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useProjectsList } from '../api/projects-list.js';
import { useTaskStages } from '../api/task-stages.js';
import { useUsersList } from '../api/users-list.js';
import { useAuthStore } from '../auth-store.js';
import type { FilterFieldDef, FilterValue } from './list-filters.js';
import type { FilterPreset } from './use-list-toolbar.js';

/** Поисковая строка задачи: номер + название (подстрока, без регистра). */
export const taskSearchText = (t: TaskListItem) => `${t.number} ${t.title}`;

/** Просрочена: дедлайн в прошлом и задача не завершена/не закрыта. */
export function isTaskOverdue(t: TaskListItem, now: number): boolean {
  if (!t.deadline) return false;
  if (t.stage.systemState === 'done' || t.stage.systemState === 'closed') return false;
  return new Date(t.deadline).getTime() < now;
}

/** Встроенные пресеты задач (левая колонка панели, модель Битрикс24):
 *  быстрое применение кликом; «скрепка» — любой пресет по умолчанию. */
export const taskBuiltinPresets: FilterPreset[] = [
  { id: 'active', name: ui.tasks.stageStates.active, state: { systemState: 'active' } },
  { id: 'mine-assignee', name: ui.tasks.roles.assignee, state: { role: 'assignee' } },
  { id: 'mine-creator', name: ui.tasks.roles.creator, state: { role: 'creator' } },
  { id: 'overdue', name: ui.tasks.presetOverdue, state: { overdue: 'yes' } },
  { id: 'done', name: ui.tasks.stageStates.done, state: { systemState: 'done' } },
];

/** Крайний срок в диапазоне дат (ISO-дата срезается до YYYY-MM-DD). */
function deadlineMatch(item: TaskListItem, value: FilterValue): boolean {
  if (typeof value !== 'object' || value === undefined) return true;
  if (!item.deadline) return false;
  const day = item.deadline.slice(0, 10);
  if (value.from && day < value.from) return false;
  if (value.to && day > value.to) return false;
  return true;
}

/**
 * Реестр фильтруемых полей задач (стандарт списков): стадия, роль («я —
 * ответственный/постановщик/соисполнитель», модель «Все роли» Битрикс24),
 * ответственный, постановщик, приоритет, крайний срок; проект — где уместен
 * (в карточке проекта скрыт). В карточке сотрудника скрыт и ответственный.
 * Справочники (стадии, люди, проекты) — shared-хуки (I6).
 */
export function useTaskFilterDefs({
  projectVisible = true,
  assigneeVisible = true,
}: { projectVisible?: boolean; assigneeVisible?: boolean } = {}): FilterFieldDef<TaskListItem>[] {
  const { data: stages } = useTaskStages();
  const { data: users } = useUsersList();
  const { data: projects } = useProjectsList();
  const meId = useAuthStore((s) => s.user?.id);

  return useMemo(() => {
    const people = (users?.items ?? []).map((u) => ({ value: u.id, label: u.displayName }));
    const defs: FilterFieldDef<TaskListItem>[] = [
      {
        id: 'stage',
        label: ui.tasks.fieldStage,
        type: 'select',
        options: (stages ?? []).map((s) => ({ value: s.id, label: s.name })),
        match: (t, v) => t.stage.id === v,
      },
      {
        id: 'systemState',
        label: ui.tasks.systemState,
        type: 'select',
        options: Object.entries(ui.tasks.stageStates).map(([value, label]) => ({ value, label })),
        match: (t, v) => t.stage.systemState === v,
      },
      {
        id: 'role',
        label: ui.tasks.roleLabel,
        type: 'select',
        options: [
          { value: 'assignee', label: ui.tasks.roles.assignee },
          { value: 'creator', label: ui.tasks.roles.creator },
          { value: 'participant', label: ui.tasks.roles.participant },
        ],
        match: (t, v) =>
          v === 'assignee'
            ? t.assignee?.id === meId
            : v === 'creator'
              ? t.creator.id === meId
              : v === 'participant'
                ? t.participants.some((p) => p.id === meId)
                : true,
      },
      {
        id: 'creator',
        label: ui.tasks.creator,
        type: 'person',
        options: people,
        match: (t, v) => t.creator.id === v,
      },
      {
        id: 'priority',
        label: ui.tasks.fieldPriority,
        type: 'select',
        options: Object.entries(ui.tasks.priority).map(([value, label]) => ({ value, label })),
        match: (t, v) => t.priority === v,
      },
      {
        id: 'deadline',
        label: ui.tasks.deadline,
        type: 'dateRange',
        match: deadlineMatch,
      },
      {
        // Скрытое служебное поле: в панель не выводится; используется пресетом
        // «Просрочены» и счётчиком просрочки в шапке журнала задач.
        id: 'overdue',
        label: ui.tasks.overdueField,
        type: 'select',
        hidden: true,
        options: [{ value: 'yes', label: ui.filters.yes }],
        match: (t, v) => v !== 'yes' || isTaskOverdue(t, Date.now()),
      },
    ];
    if (assigneeVisible) {
      defs.splice(2, 0, {
        id: 'assignee',
        label: ui.tasks.assignee,
        type: 'person',
        options: people,
        match: (t, v) => t.assignee?.id === v,
      });
    }
    if (projectVisible) {
      defs.splice(assigneeVisible ? 4 : 3, 0, {
        id: 'project',
        label: ui.tasks.project,
        type: 'select',
        options: (projects?.items ?? []).map((p) => ({
          value: p.id,
          label: `${p.code} ${p.name}`,
        })),
        match: (t, v) => t.project?.id === v,
      });
    }
    return defs;
  }, [stages, users, projects, meId, projectVisible, assigneeVisible]);
}
