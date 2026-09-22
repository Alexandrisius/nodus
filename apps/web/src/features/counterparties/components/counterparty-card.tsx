import { Building2, Mail, Phone, Plus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useCounterpartyCard, useAddContactPerson } from '../../../shared/counterparties/api.js';
import { useLettersList } from '../../../shared/api/letters-list.js';
import { useProjectsList } from '../../../shared/api/projects-list.js';
import { formatDate } from '../../../shared/lib/format.js';
import { monoCell } from '../../../shared/ui/person-cell.js';
import { ProjectIdentityIcon } from '../../../shared/ui/project-identity-icon.js';

/** Форма контактного лица (раскрывается кнопкой «Добавить»). */
function ContactForm({ counterpartyId, onDone }: { counterpartyId: string; onDone: () => void }) {
  const add = useAddContactPerson(counterpartyId);
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function submit() {
    if (!fullName.trim() || add.isPending) return;
    add.mutate(
      {
        fullName: fullName.trim(),
        position: position.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="node-panel flex flex-col gap-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={ui.counterparties.contactName}
          className="h-8 text-sm"
        />
        <Input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder={ui.counterparties.contactPosition}
          className="h-8 text-sm"
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={ui.counterparties.contactPhone}
          className="h-8 font-mono text-label-sm"
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={ui.counterparties.contactEmail}
          className="h-8 font-mono text-label-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          {ui.common.cancel}
        </Button>
        <Button size="sm" disabled={!fullName.trim() || add.isPending} onClick={submit}>
          {ui.common.add}
        </Button>
      </div>
    </div>
  );
}

/** Карточка контрагента (стек, ADR-0009): реквизиты организации, контактные
 *  лица (добавление инлайн), связанные письма и проекты. НЕ CRM — только
 *  справочник и связи (вердикт владельца 22.09.2026). */
export function CounterpartyCard({ counterpartyId }: { counterpartyId: string }) {
  const { data: card, isLoading } = useCounterpartyCard(counterpartyId);
  const { data: letters } = useLettersList(undefined, counterpartyId);
  const { data: projects } = useProjectsList();
  const openCard = useOpenCard();
  const [contactFormOpen, setContactFormOpen] = useState(false);

  if (isLoading || !card) {
    return (
      <div className="content-fade flex h-full flex-col gap-4 overflow-y-auto p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-32 w-full max-w-2xl" />
      </div>
    );
  }

  const relatedProjects = (projects?.items ?? []).filter((p) => p.client?.id === card.id);

  return (
    <div className="content-fade h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl p-6">
        {/* Реквизиты организации */}
        <div className="flex items-start gap-3">
          <span className="node-panel flex size-10 shrink-0 items-center justify-center">
            <Building2 className="size-4.5 text-muted-foreground" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{card.shortName}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{card.fullName}</div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
              {card.unp ? (
                <span>
                  {ui.counterparties.unp}: <span className={monoCell}>{card.unp}</span>
                </span>
              ) : null}
              {card.address ? <span className="truncate">{card.address}</span> : null}
            </div>
          </div>
        </div>

        {/* Контактные лица */}
        <div className="mt-8 flex items-center gap-3">
          <NodeLabel label={ui.counterparties.contactPersons} count={card.contactPersons.length} />
          <button
            type="button"
            onClick={() => setContactFormOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            <Plus className="size-3" />
            {ui.counterparties.contactPersonAdd}
          </button>
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {card.contactPersons.length === 0 && !contactFormOpen ? (
            <p className="text-sm text-muted-foreground">{ui.counterparties.noContacts}</p>
          ) : null}
          {card.contactPersons.map((person) => (
            <div key={person.id} className="node-panel flex items-center gap-3 px-3 py-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{person.fullName}</div>
                {person.position ? (
                  <div className="truncate text-xs text-muted-foreground">{person.position}</div>
                ) : null}
              </div>
              {person.phone ? (
                <span className="flex shrink-0 items-center gap-1 font-mono text-label-sm text-muted-foreground">
                  <Phone className="size-3" strokeWidth={1.5} />
                  {person.phone}
                </span>
              ) : null}
              {person.email ? (
                <span className="flex min-w-0 shrink items-center gap-1 font-mono text-label-sm text-muted-foreground">
                  <Mail className="size-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{person.email}</span>
                </span>
              ) : null}
            </div>
          ))}
          {contactFormOpen ? (
            <ContactForm counterpartyId={card.id} onDone={() => setContactFormOpen(false)} />
          ) : null}
        </div>

        {/* Связанные письма */}
        <div className="mt-8">
          <NodeLabel label={ui.counterparties.relatedLetters} count={letters?.items.length ?? 0} />
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {(letters?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ui.counterparties.noLetters}</p>
          ) : null}
          {(letters?.items ?? []).map((letter) => (
            <button
              key={letter.id}
              type="button"
              onClick={() => openCard({ kind: 'letter', id: letter.id })}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/50"
            >
              <span className="w-24 shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                {letter.registration?.regNumber ?? '—'}
              </span>
              <span className="min-w-0 flex-1 truncate">{letter.subject}</span>
              <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                {formatDate(letter.date)}
              </span>
            </button>
          ))}
        </div>

        {/* Связанные проекты (поле «Заказчик») */}
        <div className="mt-8">
          <NodeLabel label={ui.counterparties.relatedProjects} count={relatedProjects.length} />
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {relatedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ui.counterparties.noProjects}</p>
          ) : null}
          {relatedProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => openCard({ kind: 'project', id: project.id })}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/50"
            >
              <ProjectIdentityIcon color={project.color} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
