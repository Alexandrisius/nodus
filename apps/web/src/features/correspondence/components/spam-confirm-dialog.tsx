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

/** Подтверждение «Удалить как спам» (#55, Р12): необратимо — письмо и файлы
 *  удаляются, в журнале остаётся только отметка. Enter — подтвердить. */
export function SpamConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-[14px] p-5">
        <DialogHeader>
          <DialogTitle>{ui.letters.spam.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{ui.letters.spam.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {ui.common.cancel}
          </Button>
          <Button variant="destructive" autoFocus onClick={onConfirm}>
            {ui.letters.spam.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
