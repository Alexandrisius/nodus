import { CalendarDays, Hash, Mail, MapPin, Phone } from 'lucide-react';
import type { CounterpartyCard } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDateTimeShort } from '../../../shared/lib/format.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { monoCell } from '../../../shared/ui/person-cell.js';

const notSet = <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>;

/**
 * Реквизиты контрагента — реестр полей карточки (EntityFields, референс
 * ClickUp): УНП, адрес, эл. почта (mailto), телефон (tel), «в справочнике с».
 * Видимость полей настраивается «+ Поле» (persist localStorage).
 */
export function CounterpartyRequisites({ card }: { card: CounterpartyCard }) {
  const defs: EntityFieldDef[] = [
    {
      key: 'unp',
      icon: <Hash className="size-3.5" strokeWidth={1.75} />,
      label: ui.counterparties.unp,
      render: () => (card.unp ? <span className={monoCell}>{card.unp}</span> : notSet),
    },
    {
      key: 'address',
      icon: <MapPin className="size-3.5" strokeWidth={1.75} />,
      label: ui.counterparties.address,
      render: () => (card.address ? <span className="text-sm">{card.address}</span> : notSet),
    },
    {
      key: 'email',
      icon: <Mail className="size-3.5" strokeWidth={1.75} />,
      label: ui.counterparties.email,
      render: () =>
        card.email ? (
          <a
            href={`mailto:${card.email}`}
            className="font-mono text-label-sm text-info hover:underline"
          >
            {card.email}
          </a>
        ) : (
          notSet
        ),
    },
    {
      key: 'phone',
      icon: <Phone className="size-3.5" strokeWidth={1.75} />,
      label: ui.counterparties.phone,
      render: () =>
        card.phone ? (
          <a
            href={`tel:${card.phone.replace(/[^\d+]/gu, '')}`}
            className="font-mono text-label-sm text-info hover:underline"
          >
            {card.phone}
          </a>
        ) : (
          notSet
        ),
    },
    {
      key: 'createdAt',
      icon: <CalendarDays className="size-3.5" strokeWidth={1.75} />,
      label: ui.counterparties.createdAt,
      render: () => <span className={monoCell}>{formatDateTimeShort(card.createdAt)}</span>,
    },
  ];

  return <EntityFields defs={defs} storageKey="nodus-counterparty-fields-v1" />;
}
