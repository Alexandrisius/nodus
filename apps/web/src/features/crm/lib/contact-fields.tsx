import type { ContactPerson } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { monoCell } from '../../../shared/ui/person-cell.js';
import type { DataTableField } from '../../../shared/views/data-table.js';

const dash = <span className={monoCell}>—</span>;

/** Реестр колонок вкладки «Контакты» карточки контрагента (ключ вида
 *  `crm.contacts`): контактное лицо — сущность со своими полями (модель
 *  Битрикс24: контакт — отдельная запись), поэтому список с колонками,
 *  шестерёнкой и ресайзом, а не карточки-плитки. Новое поле контакта
 *  (в т.ч. настраиваемое) = +1 запись здесь. */
export const contactFields: DataTableField<ContactPerson>[] = [
  {
    id: 'fullName',
    label: ui.counterparties.contactName,
    defaultVisible: true,
    defaultWidth: 260,
    minWidth: 160,
    locked: true,
    render: (c) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{c.fullName}</span>
        {c.archivedAt ? (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-label-sm text-muted-foreground">
            {ui.counterparties.archivedBadge}
          </span>
        ) : null}
      </span>
    ),
    sortValue: (c) => c.fullName,
  },
  {
    id: 'position',
    label: ui.counterparties.contactPosition,
    defaultVisible: true,
    defaultWidth: 220,
    minWidth: 120,
    maxWidth: 480,
    render: (c) => (c.position ? <span className="truncate text-sm">{c.position}</span> : dash),
    sortValue: (c) => c.position,
  },
  {
    id: 'phone',
    label: ui.counterparties.contactPhone,
    defaultVisible: true,
    defaultWidth: 170,
    minWidth: 120,
    render: (c) => (c.phone ? <span className={monoCell}>{c.phone}</span> : dash),
    sortValue: (c) => c.phone,
  },
  {
    id: 'email',
    label: ui.counterparties.contactEmail,
    defaultVisible: true,
    defaultWidth: 230,
    minWidth: 140,
    render: (c) =>
      c.email ? <span className="truncate font-mono text-label-sm">{c.email}</span> : dash,
    sortValue: (c) => c.email,
  },
];
