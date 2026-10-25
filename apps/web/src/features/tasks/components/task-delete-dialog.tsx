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

import { useDeleteTask } from '../api/task-edit-api.js';

/** Подтверждение удаления задачи из журнала (#460, канон меню строки):
 *  удаление необратимо — диалог, а не мгновенное действие в меню.
 *  Компонент монтируется только при выбранной задаче (хук мутации привязан
 *  к id — правило хуков не нарушается условным рендером компонента). */
export function TaskDeleteDialog({
  taskId,
  open,
  onClose,
}: {
  taskId: string;
  open: boolean;
  onClose: () => void;
}) {
  const remove = useDeleteTask(taskId);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.tasks.deleteTaskConfirm}</DialogTitle>
          <DialogDescription>{ui.tasks.deleteTaskText}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
          >
            {ui.tasks.deleteTask}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
