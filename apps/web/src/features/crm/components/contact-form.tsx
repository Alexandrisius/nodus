import { useState, type FormEvent, type ReactNode } from 'react';
import type { ContactPerson } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';

import { useAddContactPerson } from '../../../shared/counterparties/mutations.js';
import { useUpdateContactPerson } from '../api/counterparty-edit.js';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Окно контактного лица: добавление (`contact` нет) и правка (#460) —
 * открывается из вкладки «Контакты» («Создать», клик по строке, «Изменить»
 * в меню строки). Монтируется ТОЛЬКО на время показа (потребитель рендерит
 * его условно): иначе на анимации закрытия окно перерисовалось бы в другом
 * режиме — урок мигания окна правки контрагента. Валидация значений —
 * сервер (zod-схема контракта), здесь только обязательность ФИО.
 */
export function ContactFormDialog({
  counterpartyId,
  contact = null,
  onClose,
}: {
  counterpartyId: string;
  contact?: ContactPerson | null;
  onClose: () => void;
}) {
  const add = useAddContactPerson(counterpartyId);
  const update = useUpdateContactPerson(counterpartyId, contact?.id ?? '');
  const [fullName, setFullName] = useState(contact?.fullName ?? '');
  const [position, setPosition] = useState(contact?.position ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const pending = add.isPending || update.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      fullName: fullName.trim(),
      position: position.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    };
    if (!body.fullName || pending) return;
    if (contact) update.mutate(body, { onSuccess: onClose });
    else add.mutate(body, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {contact ? ui.counterparties.contactEditTitle : ui.counterparties.contactNewTitle}
            </DialogTitle>
            <DialogDescription>{ui.counterparties.contactFormHint}</DialogDescription>
          </DialogHeader>
          <Field label={ui.counterparties.contactName}>
            <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label={ui.counterparties.contactPosition}>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.counterparties.contactPhone}>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="font-mono text-label-sm"
              />
            </Field>
            <Field label={ui.counterparties.contactEmail}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="font-mono text-label-sm"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {ui.common.cancel}
            </Button>
            <Button type="submit" disabled={!fullName.trim() || pending}>
              {contact ? ui.common.save : ui.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
