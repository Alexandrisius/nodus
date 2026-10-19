import { Link2, MoreHorizontal, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { TaskDetail } from '@nodus/contracts';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';

import { useCloseCard } from '../../../app/shell/use-card-stack.js';
import { copyCardLink } from '../../../shared/lib/card-link.js';
import { useDeleteTask } from '../api/task-edit-api.js';
import { TaskChangeTypeDialog } from './task-change-type-dialog.js';

/** Меню «⋯» шапки карточки (#311, пилот): ссылка на задачу, смена типа
 *  (#378, доступна тем, кто может править) и удаление. Диалоги — сиблинги
 *  меню, не внутри его слоя (канон диалогов из оверлеев). */
export function TaskCardMenu({ task }: { task: TaskDetail }) {
  const remove = useDeleteTask(task.id);
  const closeCard = useCloseCard();
  const [confirm, setConfirm] = useState(false);
  const [changeType, setChangeType] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={ui.tasks.taskActions}
          title={ui.tasks.taskActions}
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent data-[state=open]:bg-accent"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => void copyCardLink({ kind: 'task', id: task.id })}>
            <Link2 className="size-3.5" />
            {ui.common.copyLink}
          </DropdownMenuItem>
          {task.access.canEdit ? (
            <DropdownMenuItem onSelect={() => setChangeType(true)}>
              <Repeat className="size-3.5" />
              {ui.tasks.changeTypeMenu}
            </DropdownMenuItem>
          ) : null}
          {task.access.canDelete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
              <Trash2 className="size-3.5" />
              {ui.tasks.deleteTask}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ui.tasks.deleteTaskConfirm}</DialogTitle>
            <DialogDescription>{ui.tasks.deleteTaskText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {ui.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setConfirm(false);
                    closeCard();
                  },
                })
              }
            >
              {ui.tasks.deleteTask}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {changeType ? (
        <TaskChangeTypeDialog task={task} onClose={() => setChangeType(false)} />
      ) : null}
    </>
  );
}
