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
 * «Пригласить в обсуждение» (редизайн #56): канцелярия добавляет коллегу во
 * внутренний чат письма — и до регистрации (обсуждение переживает её).
 * Выбор сотрудника — тот же селектор, что у адресата (группа «Принимают
 * решения» + серверный поиск). Окно закрывается только намеренно: выбор —
 * «грязная» работа, мимо-клик её не стирает.
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
  const [picked, setPicked] = useState<UserRef | null>(null);
  const invite = useInviteLetterParticipant(letterId);

  function close(next: boolean) {
    if (invite.isPending) return;
    onOpenChange(next);
    if (!next) setPicked(null);
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
        {/* Тот же селектор сотрудников, что у адресата, но со своей подсказкой:
            выбираем коллегу в обсуждение, а не адресата письма. */}
        <AddresseeField
          value={picked}
          onChange={setPicked}
          invalid={false}
          placeholder={ui.letters.card.invitePlaceholder}
          ariaLabel={ui.letters.card.invitePlaceholder}
          openOnFocus={false}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={invite.isPending}>
            {ui.common.cancel}
          </Button>
          <Button
            onClick={() =>
              picked &&
              invite.mutate(picked.id, {
                onSuccess: () => close(false),
              })
            }
            disabled={!picked || invite.isPending}
            aria-busy={invite.isPending || undefined}
          >
            {ui.letters.card.inviteSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
