import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';

/** Подтверждение архивации проекта (заморозка, Р1): обычное окно без ввода —
 *  клик мимо = «нет». Общее для журнала и карточки. */
export function ProjectArchiveDialog({
  name,
  open,
  onCancel,
  onConfirm,
}: {
  name: string | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md sm:max-w-md" aria-describedby={undefined}>
        <DialogTitle>{ui.projects.archiveConfirmTitle}</DialogTitle>
        <p className="text-sm text-muted-foreground">{ui.projects.archiveConfirmBody}</p>
        <p className="truncate text-sm font-medium">{name}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {ui.projects.statusArchive}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {ui.common.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
