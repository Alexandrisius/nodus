import { useState } from 'react';
import type { ContactPerson } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';

import { useAddContactPerson } from '../../../shared/counterparties/mutations.js';
import { useUpdateContactPerson } from '../api/counterparty-edit.js';

/**
 * Инлайн-форма контактного лица: добавление (`contact` нет) и правка (#460).
 * Поля — ФИО, должность, телефон, эл. почта; валидация значений — сервер
 * (zod-схема контракта), здесь только обязательность ФИО.
 */
export function ContactForm({
  counterpartyId,
  contact = null,
  onDone,
}: {
  counterpartyId: string;
  contact?: ContactPerson | null;
  onDone: () => void;
}) {
  const add = useAddContactPerson(counterpartyId);
  const update = useUpdateContactPerson(counterpartyId, contact?.id ?? '');
  const [fullName, setFullName] = useState(contact?.fullName ?? '');
  const [position, setPosition] = useState(contact?.position ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const pending = add.isPending || update.isPending;

  function submit() {
    const body = {
      fullName: fullName.trim(),
      position: position.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    };
    if (!body.fullName || pending) return;
    if (contact) {
      update.mutate(body, { onSuccess: onDone });
      return;
    }
    add.mutate(body, { onSuccess: onDone });
  }

  return (
    <div className="node-panel flex flex-col gap-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={ui.counterparties.contactName}
          aria-label={ui.counterparties.contactName}
          className="h-8 text-sm"
        />
        <Input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder={ui.counterparties.contactPosition}
          aria-label={ui.counterparties.contactPosition}
          className="h-8 text-sm"
        />
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={ui.counterparties.contactPhone}
          aria-label={ui.counterparties.contactPhone}
          className="h-8 font-mono text-label-sm"
        />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={ui.counterparties.contactEmail}
          aria-label={ui.counterparties.contactEmail}
          className="h-8 font-mono text-label-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          {ui.common.cancel}
        </Button>
        <Button size="sm" disabled={!fullName.trim() || pending} onClick={submit}>
          {contact ? ui.common.save : ui.common.add}
        </Button>
      </div>
    </div>
  );
}
