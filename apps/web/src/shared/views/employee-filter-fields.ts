import { useMemo } from 'react';
import type { UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useUsersList } from '../api/users-list.js';
import type { FilterFieldDef } from './list-filters.js';

/** Поисковая строка сотрудника: имя + должность + подразделение. */
export const employeeSearchText = (u: UserListItem) =>
  `${u.displayName} ${u.positionName ?? ''} ${u.departmentName ?? ''}`;

/** Варианты справочника из значений списка (уникальные, по алфавиту). */
function uniqueOptions(values: (string | null)[]): { value: string; label: string }[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((v) => ({ value: v, label: v }));
}

/** Реестр фильтруемых полей сотрудников (стандарт списков): подразделение,
 *  должность (варианты — из загруженного списка, до справочников I15). */
export function useEmployeeFilterDefs(): FilterFieldDef<UserListItem>[] {
  const { data } = useUsersList();

  return useMemo(() => {
    const items = data?.items ?? [];
    return [
      {
        id: 'department',
        label: ui.employees.department,
        type: 'select' as const,
        options: uniqueOptions(items.map((u) => u.departmentName)),
        match: (u: UserListItem, v) => u.departmentName === v,
      },
      {
        id: 'position',
        label: ui.employees.position,
        type: 'select' as const,
        options: uniqueOptions(items.map((u) => u.positionName)),
        match: (u: UserListItem, v) => u.positionName === v,
      },
    ];
  }, [data]);
}
