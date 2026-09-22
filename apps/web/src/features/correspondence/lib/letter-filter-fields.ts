import { useMemo } from 'react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useUsersList } from '../../../shared/api/users-list.js';
import type { FilterFieldDef, FilterValue } from '../../../shared/views/list-filters.js';
import type { FilterPreset } from '../../../shared/views/use-list-toolbar.js';
import { documentStateOf } from './letter-document.js';

/** Поисковая строка письма: рег. номер + тема + контрагент. */
export const letterSearchText = (l: LetterListItem) =>
  `${l.registration?.regNumber ?? ''} ${l.subject} ${l.counterparty.name}`;

/** Пресеты почтового списка: «К регистрации» — очередь секретаря
 *  (незарегистрированные входящие; отдельной папки нет — модель v2). */
export const mailBuiltinPresets: FilterPreset[] = [
  { id: 'to-register', name: ui.letters.presetToRegister, state: { toRegister: 'yes' } },
];

/** Пресеты Журнала корреспонденции: документные состояния. */
export const registryBuiltinPresets: FilterPreset[] = [
  { id: 'in-work', name: ui.letters.presetInWork, state: { docState: 'in_work' } },
  { id: 'overdue', name: ui.letters.presetOverdue, state: { docState: 'overdue' } },
  { id: 'archived', name: ui.letters.presetArchived, state: { docState: 'archived' } },
];

function deadlineMatch(item: LetterListItem, value: FilterValue): boolean {
  if (typeof value !== 'object' || value === undefined) return true;
  const deadline = item.registration?.deadline ?? null;
  if (!deadline) return false;
  if (value.from && deadline < value.from) return false;
  if (value.to && deadline > value.to) return false;
  return true;
}

/** Реестр фильтруемых полей писем (стандарт списков): почтовый вид —
 *  «К регистрации» (скрытое поле пресета), канал, контрагент, ответственный,
 *  срок; журнал — состояние документа вместо регистрации/канала. */
export function useLetterFilterDefs(mode: 'mail' | 'registry'): FilterFieldDef<LetterListItem>[] {
  const { data: users } = useUsersList();

  return useMemo(() => {
    const common: FilterFieldDef<LetterListItem>[] = [
      {
        id: 'counterparty',
        label: ui.letters.counterparty,
        type: 'text' as const,
        placeholder: ui.letters.counterparty,
        match: (l: LetterListItem, v: FilterValue) =>
          typeof v !== 'string' || l.counterparty.name.toLowerCase().includes(v.toLowerCase()),
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
        match: (l: LetterListItem, v: FilterValue) => l.registration?.addressee?.id === v,
      },
      {
        id: 'deadline',
        label: ui.letters.deadline,
        type: 'dateRange' as const,
        match: deadlineMatch,
      },
    ];

    if (mode === 'registry') {
      return [
        {
          id: 'docState',
          label: ui.letters.fieldStatus,
          type: 'select' as const,
          options: [
            { value: 'in_work', label: ui.letters.documentStatus.in_work },
            { value: 'overdue', label: ui.letters.overdue },
            { value: 'executed', label: ui.letters.documentStatus.executed },
            { value: 'archived', label: ui.letters.documentStatus.archived },
          ],
          match: (l: LetterListItem, v: FilterValue) => documentStateOf(l) === v,
        },
        ...common,
      ];
    }

    return [
      {
        // Служебное поле пресета «К регистрации» (hidden — как «Просроченные»
        // в задачах): в панель фильтра не выводится, чип — в строке поиска.
        id: 'toRegister',
        label: ui.letters.presetToRegister,
        type: 'select' as const,
        hidden: true,
        options: [{ value: 'yes', label: ui.filters.yes }],
        match: (l: LetterListItem, v: FilterValue) =>
          v !== 'yes' || (l.type === 'incoming' && l.registration === null),
      },
      {
        id: 'channel',
        label: ui.letters.channel,
        type: 'select' as const,
        options: Object.entries(ui.letters.channels).map(([value, label]) => ({ value, label })),
        match: (l: LetterListItem, v: FilterValue) => l.receiveChannel === v,
      },
      ...common,
    ];
  }, [users, mode]);
}
