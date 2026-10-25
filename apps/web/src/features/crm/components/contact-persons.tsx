import { Archive, Mail, Pencil, Phone, Plus, RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { ContactPerson } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import {
  useCanCreateCounterparties,
  useCanManageCounterparties,
} from '../../../shared/counterparties/use-crm-permissions.js';
import { useSetContactArchived } from '../api/counterparty-edit.js';
import { ContactForm } from './contact-form.js';

function ContactActions({
  counterpartyId,
  contact,
  onEdit,
}: {
  counterpartyId: string;
  contact: ContactPerson;
  onEdit: () => void;
}) {
  const setArchived = useSetContactArchived(counterpartyId, contact.id);
  const archived = contact.archivedAt !== null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {archived ? null : (
        <button
          type="button"
          onClick={onEdit}
          aria-label={ui.counterparties.contactEdit}
          title={ui.counterparties.contactEdit}
          className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        disabled={setArchived.isPending}
        onClick={() => setArchived.mutate(!archived)}
        aria-label={archived ? ui.counterparties.contactRestore : ui.counterparties.contactArchive}
        title={archived ? ui.counterparties.contactRestore : ui.counterparties.contactArchive}
        className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
      >
        {archived ? (
          <RotateCcw className="size-3.5" strokeWidth={1.75} />
        ) : (
          <Archive className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
    </span>
  );
}

function ContactRow({
  counterpartyId,
  contact,
  canManage,
  onEdit,
}: {
  counterpartyId: string;
  contact: ContactPerson;
  canManage: boolean;
  onEdit: () => void;
}) {
  const archived = contact.archivedAt !== null;
  return (
    <div className={cn('node-panel flex items-center gap-3 px-3 py-2', archived && 'opacity-60')}>
      <UserRound className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{contact.fullName}</div>
        {contact.position ? (
          <div className="truncate text-xs text-muted-foreground">{contact.position}</div>
        ) : null}
      </div>
      {contact.phone ? (
        <a
          href={`tel:${contact.phone.replace(/[^\d+]/gu, '')}`}
          className="flex shrink-0 items-center gap-1 font-mono text-label-sm text-muted-foreground hover:text-foreground"
        >
          <Phone className="size-3" strokeWidth={1.5} />
          {contact.phone}
        </a>
      ) : null}
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="flex min-w-0 shrink items-center gap-1 font-mono text-label-sm text-muted-foreground hover:text-foreground"
        >
          <Mail className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{contact.email}</span>
        </a>
      ) : null}
      {canManage ? (
        <ContactActions counterpartyId={counterpartyId} contact={contact} onEdit={onEdit} />
      ) : null}
    </div>
  );
}

/**
 * Контактные лица контрагента (#460): действующие — списком, добавление и
 * правка инлайн-формой (право `crm.create` на добавление, `crm.manage` на
 * правку и архив); архивные — свёрнутой группой с «Вернуть». В архивной
 * карточке контрагента блок только читается.
 */
export function ContactPersons({
  counterpartyId,
  contacts,
  readOnly,
}: {
  counterpartyId: string;
  contacts: ContactPerson[];
  /** Контрагент в архиве — карточка read-only. */
  readOnly: boolean;
}) {
  const canCreate = useCanCreateCounterparties();
  const canManage = useCanManageCounterparties();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const active = contacts.filter((person) => person.archivedAt === null);
  const archived = contacts.filter((person) => person.archivedAt !== null);
  const canAdd = canCreate && !readOnly;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3">
        <NodeLabel label={ui.counterparties.contactPersons} count={active.length} />
        {canAdd && !addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            <Plus className="size-3" strokeWidth={1.75} />
            {ui.counterparties.contactPersonAdd}
          </button>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {active.length === 0 && !addOpen ? (
          <p className="text-sm text-muted-foreground">{ui.counterparties.noContacts}</p>
        ) : null}
        {active.map((person) =>
          editing === person.id ? (
            <ContactForm
              key={person.id}
              counterpartyId={counterpartyId}
              contact={person}
              onDone={() => setEditing(null)}
            />
          ) : (
            <ContactRow
              key={person.id}
              counterpartyId={counterpartyId}
              contact={person}
              canManage={canManage && !readOnly}
              onEdit={() => setEditing(person.id)}
            />
          ),
        )}
        {addOpen ? (
          <ContactForm counterpartyId={counterpartyId} onDone={() => setAddOpen(false)} />
        ) : null}
      </div>

      {archived.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
            {ui.counterparties.contactsArchived} · {archived.length}
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {archived.map((person) => (
              <ContactRow
                key={person.id}
                counterpartyId={counterpartyId}
                contact={person}
                canManage={canManage && !readOnly}
                onEdit={() => setEditing(person.id)}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
