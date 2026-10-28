import { useState } from 'react';
import type { UserRef } from '@nodus/contracts';
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

import { useInviteLetterParticipant } from '../../api/letters-mutations.js';
import { AddresseeField } from '../registration/addressee-field.js';

/**
 * «Пригласить в обсуждение» (редизайн #56; множественный выбор — приёмка
 * 28.10): канцелярия добавляет коллег во внутренний чат письма — и до
 * регистрации. Селектор тот же, что у адресата, но с накоплением: выбранные
 * — чипами под полем, крестик чипа убирает. Окно закрывается только
 * намеренно: выбор — «грязная» работа, мимо-клик её не стирает.
 */
export function InviteParticipantDialog({
  letterId,
  open,
  onOpenChange,
}: {
  letterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [picked, setPicked] = useState<UserRef[]>([]);
  const invite = useInviteLetterParticipant(letterId);

  function toggle(user: UserRef | null) {
    if (!user) return;
    setPicked((current) =>
      current.some((u) => u.id === user.id)
        ? current.filter((u) => u.id !== user.id)
        : [...current, user],
    );
  }

  function close(next: boolean) {
    if (invite.isPending) return;
    onOpenChange(next);
    if (!next) setPicked([]);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md rounded-[14px] p-5"
      >
        <DialogHeader>
          <DialogTitle>{ui.letters.card.invite}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {ui.letters.card.inviteLead}
          </DialogDescription>
        </DialogHeader>
        {/* Тот же селектор сотрудников, что у адресата: каждый выбор
            накапливается чипом, поле остаётся готовым к следующему. */}
        <AddresseeField
          value={null}
          onChange={toggle}
          invalid={false}
          placeholder={ui.letters.card.invitePlaceholder}
          ariaLabel={ui.letters.card.invitePlaceholder}
          openOnFocus={false}
        />
        {picked.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => toggle(user)}
                aria-label={`${ui.filters.reset}: ${user.displayName}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-accent/50 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
              >
                <span className="truncate">{user.displayName}</span>
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={invite.isPending}>
            {ui.common.cancel}
          </Button>
          <Button
            onClick={() =>
              picked.length > 0 &&
              invite.mutate(
                picked.map((user) => user.id),
                { onSuccess: () => close(false) },
              )
            }
            disabled={picked.length === 0 || invite.isPending}
            aria-busy={invite.isPending || undefined}
          >
            {ui.letters.card.inviteSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
