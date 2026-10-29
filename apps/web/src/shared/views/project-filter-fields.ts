import { useMemo } from 'react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useProjectGroups } from '../api/projects-list.js';
import type { FilterFieldDef, FilterValue } from './list-filters.js';
import type { FilterPreset } from './use-list-toolbar.js';

/** Поисковая строка проекта: шифр (может отсутствовать) + название. */
export const projectSearchText = (p: ProjectListItem) => `${p.code ?? ''} ${p.name}`;

/** Встроенные пресеты проектов (левая колонка панели фильтра). */
export const projectBuiltinPresets: FilterPreset[] = [
  { id: 'managing', name: ui.projects.presetManaging, state: { role: 'manager' } },
  { id: 'open', name: ui.projects.presetOpen, state: { visibility: 'open' } },
  { id: 'secret', name: ui.projects.presetSecret, state: { visibility: 'secret' } },
  { id: 'archived', name: ui.projects.presetArchived, state: { status: 'archived' } },
];

/** Реестр фильтруемых полей журнала проектов (стандарт списков): портфель,
 *  моя роль, видимость, статус — серверные фильтры (Р14 #52). */
export function useProjectFilterDefs(): FilterFieldDef<ProjectListItem>[] {
  const { data: groups } = useProjectGroups();

  return useMemo(
    () => [
      {
        id: 'portfolio',
        label: ui.projects.filterPortfolio,
        type: 'select' as const,
        options: (groups ?? [])
          .filter((group) => group.archivedAt === null)
          .map((group) => ({ value: group.id, label: group.name })),
        match: (p: ProjectListItem, v: FilterValue) => p.portfolio?.id === v,
      },
      {
        id: 'role',
        label: ui.projects.filterRole,
        type: 'select' as const,
        options: Object.entries(ui.projects.role).map(([value, label]) => ({ value, label })),
        match: (p: ProjectListItem, v: FilterValue) =>
          (p.myMembership.manager && v === 'manager') ||
          (p.myMembership.assistant && v === 'assistant') ||
          (p.myMembership.participant && v === 'participant') ||
          (p.myMembership.observer && v === 'observer'),
      },
      {
        id: 'visibility',
        label: ui.projects.filterVisibility,
        type: 'select' as const,
        options: Object.entries(ui.projects.visibility).map(([value, label]) => ({
          value,
          label,
        })),
        match: (p: ProjectListItem, v: FilterValue) => p.visibility === v,
      },
      {
        id: 'status',
        label: ui.projects.filterStatus,
        type: 'select' as const,
        options: Object.entries(ui.projects.status).map(([value, label]) => ({ value, label })),
        match: (p: ProjectListItem, v: FilterValue) => p.status === v,
      },
    ],
    [groups],
  );
}
