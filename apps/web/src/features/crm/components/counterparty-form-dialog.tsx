import { useState, type ReactNode } from 'react';
import type { CounterpartyCard } from '@nodus/contracts';
import { normalizeUnp, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useCreateCounterparty } from '../../../shared/counterparties/mutations.js';
import { useSimilarCounterparties } from '../../../shared/counterparties/queries.js';
import { useUpdateCounterparty } from '../api/counterparty-edit.js';
import { SimilarCounterparties } from './similar-counterparties.js';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface Draft {
  fullName: string;
  shortName: string;
  unp: string;
  address: string;
  email: string;
  phone: string;
}

function draftOf(card: CounterpartyCard | null): Draft {
  return {
    fullName: card?.fullName ?? '',
    shortName: card?.shortName ?? '',
    unp: card?.unp ?? '',
    address: card?.address ?? '',
    email: card?.email ?? '',
    phone: card?.phone ?? '',
  };
}

/**
 * Окно контрагента: создание (`card` нет) и правка реквизитов (#460).
 * Пока набирается название/УНП — панель «Похожие в справочнике»; точный УНП
 * существующего контрагента блокирует «Создать» со ссылкой на него (дубли
 * дороже всего, ADR-0033). Окно с вводом не закрывается мимо-кликом
 * (правило владельца 30.09.2026) — отмена кнопкой или Esc.
 */
export function CounterpartyFormDialog({
  open,
  onOpenChange,
  card = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Карточка для правки; null — создание. */
  card?: CounterpartyCard | null;
}) {
  const create = useCreateCounterparty();
  const update = useUpdateCounterparty(card?.id ?? '');
  const openCard = useOpenCard();
  const [draft, setDraft] = useState<Draft>(() => draftOf(card));
  const [prevOpen, setPrevOpen] = useState(open);

  // Сброс черновика при каждом открытии (рендер-тайм по переходу open, #45).
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setDraft(draftOf(card));
  }

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const unp = normalizeUnp(draft.unp);
  const { data: byUnp = [] } = useSimilarCounterparties({ name: '', unp: draft.unp });
  const unpTaken = card ? null : (byUnp.find((match) => match.matchedBy === 'unp') ?? null);
  const valid = draft.fullName.trim().length > 0 && draft.shortName.trim().length > 0;
  const pending = create.isPending || update.isPending;

  function body() {
    return {
      fullName: draft.fullName.trim(),
      shortName: draft.shortName.trim(),
      unp: unp || null,
      address: draft.address.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
    };
  }

  function submit() {
    if (!valid || unpTaken || pending) return;
    if (card) {
      update.mutate(body(), { onSuccess: () => onOpenChange(false) });
      return;
    }
    create.mutate(body(), {
      onSuccess: (created) => {
        onOpenChange(false);
        openCard({ kind: 'counterparty', id: created.id });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full bg-card sm:max-w-xl"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-base font-semibold text-foreground">
          {card ? ui.counterparties.edit : ui.counterparties.create}
        </DialogTitle>
        <div className="mt-2 flex flex-col gap-3">
          <Field label={ui.counterparties.fieldFullName}>
            <Input
              autoFocus
              value={draft.fullName}
              onChange={(e) => set('fullName')(e.target.value)}
              placeholder={ui.counterparties.fullNamePlaceholder}
              className="h-8 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.counterparties.fieldShortName}>
              <Input
                value={draft.shortName}
                onChange={(e) => set('shortName')(e.target.value)}
                placeholder={ui.counterparties.shortNamePlaceholder}
                className="h-8 text-sm"
              />
            </Field>
            <Field label={`${ui.counterparties.unp} · ${ui.counterparties.unpHint}`}>
              <Input
                value={draft.unp}
                onChange={(e) => set('unp')(e.target.value)}
                aria-invalid={Boolean(unpTaken)}
                className="h-8 font-mono text-label-sm"
              />
            </Field>
          </div>

          {unpTaken ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-warning">
              <span>
                {unpTaken.archivedAt
                  ? ui.counterparties.unpTakenArchived
                  : ui.counterparties.unpTaken}
              </span>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  openCard({ kind: 'counterparty', id: unpTaken.id });
                }}
                className="font-medium text-info hover:underline"
              >
                {unpTaken.shortName} — {ui.counterparties.openExisting}
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.counterparties.email}>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => set('email')(e.target.value)}
                className="h-8 font-mono text-label-sm"
              />
            </Field>
            <Field label={ui.counterparties.phone}>
              <Input
                type="tel"
                value={draft.phone}
                onChange={(e) => set('phone')(e.target.value)}
                className="h-8 font-mono text-label-sm"
              />
            </Field>
          </div>
          <Field label={ui.counterparties.address}>
            <Input
              value={draft.address}
              onChange={(e) => set('address')(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>

          {card ? null : (
            <SimilarCounterparties
              name={draft.fullName}
              unp={draft.unp}
              onOpen={(id) => {
                onOpenChange(false);
                openCard({ kind: 'counterparty', id });
              }}
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {ui.common.cancel}
          </Button>
          <Button size="sm" disabled={!valid || Boolean(unpTaken) || pending} onClick={submit}>
            {card ? ui.common.save : ui.common.create}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
