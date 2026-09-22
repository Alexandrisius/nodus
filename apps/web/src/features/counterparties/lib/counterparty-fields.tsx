import type { CounterpartyListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { monoCell } from '../../../shared/ui/person-cell.js';
import type { DataTableField } from '../../../shared/views/data-table.js';

/** Реестр колонок списка контрагентов (ключ вида `counterparties.list`):
 *  название (краткое) закреплено, полное название, УНП и счётчики связей —
 *  денормализованы сервером (I14: данные — актив аналитики). */
export const counterpartyFields: DataTableField<CounterpartyListItem>[] = [
  {
    id: 'shortName',
    label: ui.counterparties.fieldShortName,
    defaultVisible: true,
    defaultWidth: 260,
    minWidth: 160,
    locked: true,
    render: (c) => <span className="truncate text-sm font-medium">{c.shortName}</span>,
    sortValue: (c) => c.shortName,
  },
  {
    id: 'fullName',
    label: ui.counterparties.fieldFullName,
    defaultVisible: true,
    defaultWidth: 380,
    minWidth: 200,
    maxWidth: 640,
    render: (c) => <span className="truncate text-sm">{c.fullName}</span>,
    sortValue: (c) => c.fullName,
  },
  {
    id: 'unp',
    label: ui.counterparties.unp,
    defaultVisible: true,
    defaultWidth: 130,
    minWidth: 100,
    render: (c) =>
      c.unp ? <span className={monoCell}>{c.unp}</span> : <span className={monoCell}>—</span>,
    sortValue: (c) => c.unp,
  },
  {
    id: 'lettersCount',
    label: ui.counterparties.lettersCount,
    defaultVisible: true,
    defaultWidth: 100,
    minWidth: 80,
    render: (c) => <span className={monoCell}>{c.lettersCount}</span>,
    sortValue: (c) => c.lettersCount,
  },
  {
    id: 'projectsCount',
    label: ui.counterparties.projectsCount,
    defaultVisible: true,
    defaultWidth: 110,
    minWidth: 88,
    render: (c) => <span className={monoCell}>{c.projectsCount}</span>,
    sortValue: (c) => c.projectsCount,
  },
  {
    id: 'contactsCount',
    label: ui.counterparties.contactsCount,
    defaultVisible: false,
    defaultWidth: 110,
    minWidth: 88,
    render: (c) => <span className={monoCell}>{c.contactsCount}</span>,
    sortValue: (c) => c.contactsCount,
  },
];
