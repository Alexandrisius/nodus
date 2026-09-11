import { useMemo } from 'react';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useProjectsList } from '../api/projects-list.js';
import { useTaskStages } from '../api/task-stages.js';
import { useUsersList } from '../api/users-list.js';
import { useAuthStore } from '../auth-store.js';
import type { FilterFieldDef, FilterValue } from './list-filters.js';

/** Поисковая строка задачи: номер + название (подстрока, без регистра). */
export const taskSearchText = (t: TaskListItem) => `${t.number} ${t.title}`;

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
