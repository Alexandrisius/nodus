import { useMemo } from 'react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useUsersList } from '../api/users-list.js';
import type { FilterFieldDef, FilterValue } from './list-filters.js';
import type { FilterPreset } from './use-list-toolbar.js';

/** Поисковая строка проекта: код + название. */
export const projectSearchText = (p: ProjectListItem) => `${p.code} ${p.name}`;

/** Встроенные пресеты проектов (левая колонка панели фильтра). */
export const projectBuiltinPresets: FilterPreset[] = [
  { id: 'managing', name: ui.projects.presetManaging, state: { myRole: 'manager' } },
  { id: 'open', name: ui.projects.privacy.open, state: { privacy: 'open' } },
  { id: 'closed', name: ui.projects.privacy.closed, state: { privacy: 'closed' } },
];

function endDateMatch(item: ProjectListItem, value: FilterValue): boolean {
  if (typeof value !== 'object' || value === undefined) return true;
  if (!item.endDate) return false;
  const day = item.endDate.slice(0, 10);
  if (value.from && day < value.from) return false;
  if (value.to && day > value.to) return false;
  return true;
}

/** Реестр фильтруемых полей проектов (стандарт списков): приватность,
 *  моя роль, руководитель, окончание. */
export function useProjectFilterDefs(): FilterFieldDef<ProjectListItem>[] {
  const { data: users } = useUsersList();

  return useMemo(
    () => [
      {
        id: 'privacy',
        label: ui.projects.privacyLabel,
        type: 'select' as const,
        options: Object.entries(ui.projects.privacy).map(([value, label]) => ({ value, label })),
        match: (p: ProjectListItem, v: FilterValue) => p.privacy === v,
      },
      {
        id: 'myRole',
        label: ui.projects.myRoleLabel,
        type: 'select' as const,
        options: Object.entries(ui.projects.myRole).map(([value, label]) => ({ value, label })),
        match: (p: ProjectListItem, v: FilterValue) => p.myRole === v,
      },
      {
        id: 'manager',
        label: ui.projects.manager,
        type: 'person' as const,
        options: (users?.items ?? []).map((u) => ({ value: u.id, label: u.displayName })),
        match: (p: ProjectListItem, v: FilterValue) => p.manager?.id === v,
      },
      {
        id: 'endDate',
        label: ui.projects.endDate,
        type: 'dateRange' as const,
        match: endDateMatch,
      },
    ],
    [users],
  );
}
