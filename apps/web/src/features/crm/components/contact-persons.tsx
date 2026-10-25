import { Archive, Mail, Pencil, Phone, Plus, RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { ContactPerson } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
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
    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {archived ? null : (
        <button
          type="button"
          onClick={onEdit}
          aria-label={ui.counterparties.contactEdit}
          title={ui.counterparties.contactEdit}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
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
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
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

/** Карточка контактного лица — панель node-panel (как в первой версии
 *  справочника): крупная строка с ФИО, должностью и каналами связи. */
function ContactCard({
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
    <div
      className={cn(
        'node-panel group flex items-start gap-3 p-3 transition-colors',
        archived && 'opacity-60',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <UserRound className="size-4 text-muted-foreground" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{contact.fullName}</div>
            {contact.position ? (
              <div className="truncate text-xs text-muted-foreground">{contact.position}</div>
            ) : null}
          </div>
          {canManage ? (
            <ContactActions counterpartyId={counterpartyId} contact={contact} onEdit={onEdit} />
          ) : null}
        </div>
        {contact.phone || contact.email ? (
          <div className="mt-1.5 flex flex-col gap-1">
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/[^\d+]/gu, '')}`}
                className="flex items-center gap-1.5 font-mono text-label-sm text-muted-foreground hover:text-foreground"
              >
                <Phone className="size-3 shrink-0" strokeWidth={1.5} />
                {contact.phone}
              </a>
            ) : null}
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="flex min-w-0 items-center gap-1.5 font-mono text-label-sm text-muted-foreground hover:text-foreground"
              >
                <Mail className="size-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{contact.email}</span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Правая колонка карточки контрагента — «Контакты» (#460): полновысотная
 * панель данных (анатомия карточки: данные слева, панель справа — как чат у
 * письма и задачи). Контактные лица — крупными карточками node-panel
 * (вердикт владельца 25.10.2026: «красиво, в рамочке», как в первой версии),
 * добавление и правка — инлайн-формой (`crm.create` на добавление,
 * `crm.manage` на правку и архив), архивные — свёрнутой группой с «Вернуть».
 * В архивной карточке панель только читается.
 */
export function ContactPersonsPanel({
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
    <aside className="flex h-full min-h-0 w-[26rem] shrink-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="text-sm font-semibold text-foreground">
          {ui.counterparties.contactPersons}
        </span>
        <span className="font-mono text-label-sm text-muted-foreground tabular-nums">
          {active.length}
        </span>
        {canAdd && !addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            <Plus className="size-3" strokeWidth={1.75} />
            {ui.common.add}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {active.length === 0 && !addOpen ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">{ui.counterparties.noContacts}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {active.map((person) =>
            editing === person.id ? (
              <ContactForm
                key={person.id}
                counterpartyId={counterpartyId}
                contact={person}
                onDone={() => setEditing(null)}
              />
            ) : (
              <ContactCard
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
            <summary className="cursor-pointer px-1 text-xs font-medium text-muted-foreground select-none">
              {ui.counterparties.contactsArchived} · {archived.length}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {archived.map((person) => (
                <ContactCard
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
      </div>
    </aside>
  );
}
