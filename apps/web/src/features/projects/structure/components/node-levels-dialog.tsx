import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@nodus/ui/components/dialog';

import { NodeLevelsSection } from '../../components/node-levels-section.js';

/** Справочник видов узлов — в «Структуре», не в «Автоматизации» (вердикт
 *  владельца): шестерёнка тулбара открывает это окно. Справочник глобальный,
 *  правит его носитель права `project.setup.manage`; остальные видят список. */
export function NodeLevelsDialog({
  open,
  canManage,
  onClose,
}: {
  open: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{ui.structure.levelsTitle}</DialogTitle>
        <NodeLevelsSection canManage={canManage} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
