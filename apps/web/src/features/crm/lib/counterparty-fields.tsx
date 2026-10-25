import type { CounterpartyListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { monoCell } from '../../../shared/ui/person-cell.js';
import type { DataTableField } from '../../../shared/views/data-table.js';

/** Реестр колонок списка контрагентов (ключ вида `counterparties.list`):
 *  краткое название закреплено, полное название, УНП и счётчики связей —
 *  денормализованы сервером (I14: данные — актив аналитики); адрес, почта и
 *  телефон скрыты по умолчанию (шестерёнка включает). Архивная запись
 *  помечена в колонке названия — строка остаётся открываемой. */
export const counterpartyFields: DataTableField<CounterpartyListItem>[] = [
  {
    id: 'shortName',
    label: ui.counterparties.fieldShortName,
    defaultVisible: true,
    defaultWidth: 280,
    minWidth: 160,
    locked: true,
    render: (c) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{c.shortName}</span>
        {c.archivedAt ? (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-label-sm text-muted-foreground">
            {ui.counterparties.archivedBadge}
          </span>
        ) : null}
      </span>
    ),
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
    id: 'email',
    label: ui.counterparties.email,
    defaultVisible: false,
    defaultWidth: 220,
    minWidth: 140,
    render: (c) =>
      c.email ? (
        <span className="truncate font-mono text-label-sm">{c.email}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (c) => c.email,
  },
  {
    id: 'phone',
    label: ui.counterparties.phone,
    defaultVisible: false,
    defaultWidth: 160,
    minWidth: 120,
    render: (c) =>
      c.phone ? <span className={monoCell}>{c.phone}</span> : <span className={monoCell}>—</span>,
    sortValue: (c) => c.phone,
  },
  {
    id: 'address',
    label: ui.counterparties.address,
    defaultVisible: false,
    defaultWidth: 320,
    minWidth: 180,
    maxWidth: 640,
    render: (c) =>
      c.address ? (
        <span className="truncate text-sm">{c.address}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (c) => c.address,
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
