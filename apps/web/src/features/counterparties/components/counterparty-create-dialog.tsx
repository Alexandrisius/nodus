import { useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useCreateCounterparty } from '../../../shared/counterparties/api.js';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Создание контрагента из реестра (полная форма: полное/краткое название,
 *  УНП, адрес). Создание «на лету» из автокомплита регистрации письма —
 *  короткое, только имя (shared/counterparties/counterparty-combobox). */
export function CounterpartyCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateCounterparty();
  const openCard = useOpenCard();
  const [fullName, setFullName] = useState('');
  const [shortName, setShortName] = useState('');
  const [unp, setUnp] = useState('');
  const [address, setAddress] = useState('');

  // Сброс черновика при каждом открытии (рендер-тайм по переходу open, #45).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setFullName('');
      setShortName('');
      setUnp('');
      setAddress('');
    }
  }

  const valid = fullName.trim().length > 0 && shortName.trim().length > 0;

  function submit() {
    if (!valid || create.isPending) return;
    create.mutate(
      {
        fullName: fullName.trim(),
        shortName: shortName.trim(),
        unp: unp.trim() || null,
        address: address.trim() || null,
      },
      {
        onSuccess: (card) => {
          onOpenChange(false);
          openCard({ kind: 'counterparty', id: card.id });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg bg-card">
        <DialogTitle className="text-base font-semibold text-foreground">
          {ui.counterparties.create}
        </DialogTitle>
        <div className="mt-2 flex flex-col gap-3">
          <Field label={ui.counterparties.fieldFullName}>
            <Input
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={ui.counterparties.fullNamePlaceholder}
              className="h-8 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.counterparties.fieldShortName}>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder={ui.counterparties.shortNamePlaceholder}
                className="h-8 text-sm"
              />
            </Field>
            <Field label={`${ui.counterparties.unp} · ${ui.counterparties.unpHint}`}>
              <Input
                value={unp}
                onChange={(e) => setUnp(e.target.value)}
                className="h-8 font-mono text-label-sm"
              />
            </Field>
          </div>
          <Field label={ui.counterparties.address}>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {ui.common.cancel}
          </Button>
          <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
            {ui.common.create}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
