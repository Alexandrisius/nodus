import { useState } from 'react';
import type { TaskDetail, TaskTransition } from '@nodus/contracts';
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
import { Textarea } from '@nodus/ui/components/textarea';
import { toast } from 'sonner';

import { useBulkTasks } from '../api/task-edit-api.js';
import { useExecuteTransition } from '../api/transitions-api.js';

const OPEN = new Set(['backlog', 'active', 'paused']);

/** Запуск перехода маршрута с объяснением гейтов (ADR-0020, #311):
 *  свободный переход — сразу; заблокированный — диалог с причинами и
 *  выходами: «Завершить вместе с подзадачами» (гейт подзадач при закрытии)
 *  и «Выполнить всё равно» с причиной в историю (право task.override_gate). */
export function useTransitionRunner(task: TaskDetail) {
  const execute = useExecuteTransition(task.id);
  const [pending, setPending] = useState<TaskTransition | null>(null);

  function run(t: TaskTransition) {
    if (execute.isPending) return; // повторный клик во время хода — не дублируем
    if (t.blockedBy.length === 0) execute.mutate({ transition: t });
    else setPending(t);
  }

  const dialog = (
    <TransitionDialog
      task={task}
      transition={pending}
      onClose={() => setPending(null)}
      onExecute={(vars) => execute.mutate(vars, { onSuccess: () => setPending(null) })}
      executing={execute.isPending}
    />
  );
  /** Кнопка в ходе (спиннер на ней; панель не гаснет — чип уже сменился). */
  const runningId = execute.isPending ? (execute.variables?.transition.id ?? null) : null;
  return { run, dialog, isPending: execute.isPending, runningId };
}

function TransitionDialog({
  task,
  transition,
  onClose,
  onExecute,
  executing,
}: {
  task: TaskDetail;
  transition: TaskTransition | null;
  onClose: () => void;
  onExecute: (vars: { transition: TaskTransition; override?: boolean; reason?: string }) => void;
  executing: boolean;
}) {
  const bulk = useBulkTasks();
  const [reason, setReason] = useState('');
  const reasons = transition?.blockedBy ?? [];
  const openSubtasks = task.subtasks.filter((s) => OPEN.has(s.stage.systemState));
  // Закрыть вместе с подзадачами — только если подзадачи единственный гейт
  // и переход закрывает задачу (подзадачи идут в ту же стадию).
  const closesWithSubtasks =
    transition !== null &&
    !OPEN.has(transition.toStageState) &&
    reasons.length === 1 &&
    reasons[0]?.kind === 'no_open_subtasks' &&
    openSubtasks.length > 0;

  function closeAll() {
    if (!transition) return;
    bulk.mutate(
      {
        taskIds: openSubtasks.map((s) => s.id),
        action: { kind: 'move_to_stage', stageId: transition.toStageId },
      },
      {
        onSuccess: ({ results }) => {
          if (results.every((r) => r.ok)) {
            toast.success(ui.tasks.subtasksClosed);
            onExecute({ transition: { ...transition, blockedBy: [] } });
          } else toast.error(ui.tasks.subtasksNotClosed);
        },
      },
    );
  }

  return (
    <Dialog
      open={transition !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setReason('');
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {transition?.name} — {ui.tasks.transitionBlocked.toLowerCase()}
          </DialogTitle>
          <DialogDescription>{ui.tasks.transitionBlockedHint}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5 text-sm">
          {reasons.map((r) => (
            <li key={r.kind} className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
              <span>
                {ui.tasks.gate[r.kind]}
                {r.count ? ` · ${r.count}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {transition?.canOverride ? (
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={ui.tasks.overrideReason}
            aria-label={ui.tasks.overrideReason}
            className="min-h-16 text-sm"
          />
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.close}
          </Button>
          {transition?.canOverride ? (
            <Button
              variant="outline"
              disabled={!reason.trim() || executing}
              onClick={() =>
                transition && onExecute({ transition, override: true, reason: reason.trim() })
              }
            >
              {ui.tasks.overrideGate}
            </Button>
          ) : null}
          {closesWithSubtasks ? (
            <Button disabled={bulk.isPending || executing} onClick={closeAll}>
              {ui.tasks.closeWithSubtasks} · {openSubtasks.length}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
