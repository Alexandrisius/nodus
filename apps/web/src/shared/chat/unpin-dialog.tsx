import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@nodus/ui/components/dialog';

import { useUnpinDialog } from './dialog-stores.js';
import { usePinToggle } from './message-mutations.js';

/**
 * Подтверждение открепления (вердикт 24.09: «любое открепление — через
 * диалог»; случайный клик не теряет закреп — ранее это страховал undo-тост,
 * теперь страховка явная). Сообщение остаётся в ленте и истории — уходит
 * только из закрепов.
 */
export function UnpinDialogHost() {
  const request = useUnpinDialog((s) => s.request);
  const close = useUnpinDialog((s) => s.close);
  const unpin = usePinToggle(request?.conversationId ?? '');
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="w-full bg-card sm:max-w-md">
        <DialogTitle className="text-base font-semibold text-foreground">
          {ui.chat.unpinTitle}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {ui.chat.unpinHint}
        </DialogDescription>
        <span className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {ui.common.cancel}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!request) return;
              unpin.unpin.mutate(request.messageId, { onSettled: close });
            }}
          >
            {ui.chat.unpin}
          </Button>
        </span>
      </DialogContent>
    </Dialog>
  );
}
