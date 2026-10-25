import { useState } from 'react';
import type { TaskDetail, WorkflowTransition } from '@nodus/contracts';
import {
  effectiveWindowSections,
  isCompletedState,
  isFinalState,
  isReviewState,
  ui,
} from '@nodus/contracts';
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

import { useTaskConversation } from '../../../shared/chat/chat-queries.js';
import {
  visibleDefinitions,
  useCustomFieldDefinitions,
} from '../../../shared/custom-fields/queries.js';
import { TransitionWindow } from '../../../shared/workflow/transition-window/transition-window.js';
import { routeTransition } from '../../../shared/workflow/transition-window/window-can-unblock.js';
import type { TransitionWindowContext } from '../../../shared/workflow/transition-window/window-context.js';
import { useBulkTasks } from '../api/task-edit-api.js';
import {
  transitionWindowError,
  useExecuteTransition,
  useSubmitTransitionWindow,
} from '../api/transitions-api.js';

/** Контекст окна из карточки (#380): поля, итог, права, сдача утверждающему;
 *  определения полей области — из реестра (#431), ссылки — из детали. */
function windowContextOf(
  task: TaskDetail,
  conversationId: string | null,
  customFieldDefinitions: TransitionWindowContext['customFieldDefinitions'],
): TransitionWindowContext {
  return {
    entityId: task.id,
    conversationId,
    currentStageName: task.stage.name,
    fields: {
      description: task.description,
      deadline: task.deadline,
      assigneeId: task.assignee?.id ?? null,
      plannedMinutes: task.plannedMinutes,
      customFields: task.customFields ?? {},
    },
    spentMinutes: task.spentMinutes,
    lastResult: task.result ? { text: task.result.text, messageIds: task.result.messageIds } : null,
    access: {
      canEdit: task.access.canEdit,
      canLogTime: task.access.canLogTime,
      canCheck: task.access.canCheck,
    },
    submission:
      isReviewState(task.stage.systemState) && task.result
        ? {
            author: task.result.author,
            result: { text: task.result.text, messageIds: task.result.messageIds },
            createdAt: task.result.createdAt,
          }
        : null,
    scope: 'entity',
    customFieldDefinitions,
    customFieldRefs: task.customFieldRefs ?? [],
  };
}

/** Запуск перехода маршрута (ADR-0020, #311, окно — #380):
 *  - кнопка с окном → окно перехода;
 *  - заблокированная кнопка, которую окно может разблокировать → окно;
 *  - иначе заблокированная → прежний диалог причин (обход, подзадачи);
 *  - свободная → сразу, оптимистично. */
export function useTransitionRunner(task: TaskDetail) {
  const execute = useExecuteTransition(task.id);
  const submit = useSubmitTransitionWindow(task.id);
  const { data: conversation } = useTaskConversation(task.id);
  const { data: definitions } = useCustomFieldDefinitions('task');
  const [pending, setPending] = useState<WorkflowTransition | null>(null);
  const [windowTransition, setWindowTransition] = useState<WorkflowTransition | null>(null);

  function run(t: WorkflowTransition) {
    if (execute.isPending || submit.isPending) return;
    const route = routeTransition(t, task.access);
    if (route === 'window') {
      submit.reset();
      setWindowTransition(t);
      return;
    }
    if (route === 'execute') execute.mutate({ transition: t });
    else setPending(t);
  }

  const closeWindow = () => {
    setWindowTransition(null);
    submit.reset();
  };

  const dialog = (
    <>
      <TransitionDialog
        task={task}
        transition={pending}
        onClose={() => setPending(null)}
        onExecute={(vars) => execute.mutate(vars, { onSuccess: () => setPending(null) })}
        executing={execute.isPending}
      />
      {windowTransition ? (
        <TransitionWindow
          open
          mode="live"
          transition={windowTransition}
          context={windowContextOf(task, conversation?.id ?? null, visibleDefinitions(definitions))}
          submitting={submit.isPending}
          error={submit.error ? transitionWindowError(submit.error) : null}
          onCancel={closeWindow}
          onSubmit={(body, override) =>
            submit.mutate(
              {
                transition: windowTransition,
                body: { ...body, ...(override ?? {}) },
              },
              { onSuccess: closeWindow },
            )
          }
          onOpenChecklist={closeWindow}
          onOpenSubtasks={closeWindow}
        />
      ) : null}
    </>
  );
  /** Кнопка в ходе (спиннер на ней; панель не гаснет — чип уже сменился). */
  const running = windowTransition ?? execute.variables?.transition ?? null;
  return {
    run,
    dialog,
    isPending: execute.isPending || submit.isPending,
    runningId: execute.isPending || submit.isPending ? (running?.id ?? null) : null,
  };
}

function TransitionDialog({
  task,
  transition,
  onClose,
  onExecute,
  executing,
}: {
  task: TaskDetail;
  transition: WorkflowTransition | null;
  onClose: () => void;
  onExecute: (vars: {
    transition: WorkflowTransition;
    override?: boolean;
    reason?: string;
  }) => void;
  executing: boolean;
}) {
  const bulk = useBulkTasks();
  const [reason, setReason] = useState('');
  const reasons = transition?.blockedBy ?? [];
  const openSubtasks = task.subtasks.filter((s) => !isFinalState(s.stage.systemState));
  // Закрыть вместе с подзадачами — только если подзадачи единственный гейт
  // и переход ЗАВЕРШАЕТ задачу (итог «выполнена»; подзадачи идут в ту же
  // стадию). Сдача на утверждение — нет: строгий гейт считает и подзадачи
  // на утверждении (ADR-0020, дополнение 2) — родитель снова упёрся бы.
  const closesWithSubtasks =
    transition !== null &&
    isCompletedState(transition.toStageState, transition.toStageOutcome) &&
    reasons.length === 1 &&
    reasons[0]?.kind === 'no_open_subtasks' &&
    openSubtasks.length > 0;
  // Окно доступно, но не разблокирует (подзадачи/чек-лист) — показываем
  // подсказку: остальные условия можно дозаполнить в окне.
  const windowHelpful =
    transition !== null &&
    effectiveWindowSections(transition.form, { validators: transition.validators }).length > 0;

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
          <DialogDescription>
            {windowHelpful ? ui.tasks.window.overrideSection : ui.tasks.transitionBlockedHint}
          </DialogDescription>
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
