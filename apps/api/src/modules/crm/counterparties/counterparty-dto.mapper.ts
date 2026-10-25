import type { ContactPerson, CounterpartyCard, CounterpartyListItem } from '@nodus/contracts';

import type { ContactPersonRow } from '../contacts/contacts.repository.js';
import type { CounterpartyRow } from './counterparties.repository.js';

/** ISO-строка или null (контракт дат — UTC ISO 8601, I7). */
function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toContactPerson(row: ContactPersonRow): ContactPerson {
  return {
    id: row.id,
    fullName: row.fullName,
    position: row.position,
    email: row.email,
    phone: row.phone,
    archivedAt: iso(row.archivedAt),
  };
}

export function toCounterpartyListItem(
  row: CounterpartyRow,
  counts: { lettersCount: number; projectsCount: number; contactsCount: number },
): CounterpartyListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    shortName: row.shortName,
    unp: row.unp,
    address: row.address,
    email: row.email,
    phone: row.phone,
    lettersCount: counts.lettersCount,
    projectsCount: counts.projectsCount,
    contactsCount: counts.contactsCount,
    archivedAt: iso(row.archivedAt),
  };
}

export function toCounterpartyCard(
  row: CounterpartyRow,
  contacts: ContactPersonRow[],
  counts: { lettersCount: number; projectsCount: number },
): CounterpartyCard {
  return {
    id: row.id,
    fullName: row.fullName,
    shortName: row.shortName,
    unp: row.unp,
    address: row.address,
    email: row.email,
    phone: row.phone,
    customFields: (row.customFields ?? {}) as Record<string, unknown>,
    lettersCount: counts.lettersCount,
    projectsCount: counts.projectsCount,
    contactPersons: contacts.map(toContactPerson),
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
