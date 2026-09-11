import { useMemo } from 'react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useUsersList } from '../../../shared/api/users-list.js';
import type { FilterFieldDef, FilterValue } from '../../../shared/views/list-filters.js';
import type { FilterPreset } from '../../../shared/views/use-list-toolbar.js';

/** Поисковая строка письма: рег. номер + тема + корреспондент. */
export const letterSearchText = (l: LetterListItem) =>
  `${l.regNumber ?? ''} ${l.subject} ${l.correspondent}`;

/** Встроенные пресеты писем (левая колонка панели фильтра). */
export const letterBuiltinPresets: FilterPreset[] = [
  { id: 'in-work', name: ui.letters.status.in_work, state: { status: 'in_work' } },
  { id: 'overdue', name: ui.letters.status.overdue, state: { status: 'overdue' } },
];

function deadlineMatch(item: LetterListItem, value: FilterValue): boolean {
  if (typeof value !== 'object' || value === undefined) return true;
  if (!item.deadline) return false;
  if (value.from && item.deadline < value.from) return false;
  if (value.to && item.deadline > value.to) return false;
  return true;
}

/** Реестр фильтруемых полей писем (стандарт списков): статус, адресат,
 *  корреспондент (подстрока), срок исполнения. */
export function useLetterFilterDefs(): FilterFieldDef<LetterListItem>[] {
  const { data: users } = useUsersList();

  return useMemo(
    () => [
      {
        id: 'status',
        label: ui.letters.fieldStatus,
        type: 'select' as const,
        options: Object.entries(ui.letters.status).map(([value, label]) => ({ value, label })),
        match: (l: LetterListItem, v: FilterValue) => l.status === v,
      },
      {
        id: 'addressee',
        label: ui.letters.addressee,
        type: 'person' as const,
        options: (users?.items ?? []).map((u) => ({
          value: u.id,
          label: u.displayName,
          avatarUrl: u.avatarUrl ?? null,
        })),
        match: (l: LetterListItem, v: FilterValue) => l.addressee?.id === v,
      },
      {
        id: 'correspondent',
        label: ui.letters.correspondent,
        type: 'text' as const,
        placeholder: ui.letters.correspondent,
        match: (l: LetterListItem, v: FilterValue) =>
          typeof v !== 'string' || l.correspondent.toLowerCase().includes(v.toLowerCase()),
      },
      {
        id: 'deadline',
        label: ui.letters.deadline,
        type: 'dateRange' as const,
        match: deadlineMatch,
      },
    ],
    [users],
  );
}
