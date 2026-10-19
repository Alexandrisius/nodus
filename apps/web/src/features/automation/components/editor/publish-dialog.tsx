import { useMemo, useState } from 'react';
import type { PublishWorkflowResult, WorkflowDetail } from '@nodus/contracts';
import { errorMessages, ui } from '@nodus/contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';
import { Button } from '@nodus/ui/components/button';
import { ApiError } from '../../../../shared/api-client.js';
import { pluralRu } from '../../lib/plural-ru.js';

import type { usePublishWorkflow } from '../../api/automation-api.js';
import type { WorkflowDraftDocument } from '@nodus/contracts';

/** Дефолт переноса: первый живой статус того же этапа, иначе начальный. */
function defaultTargetOf(
  baseline: WorkflowDraftDocument,
  doc: WorkflowDraftDocument,
  removedStageId: string,
): string {
  const removedStage = baseline.stages.find((s) => s.id === removedStageId);
  if (!removedStage) return '';
  return (
    doc.stages.find((s) => s.systemState === removedStage.systemState)?.id ??
    doc.stages.find((s) => s.isInitial)?.id ??
    doc.stages[0]?.id ??
    ''
  );
}

/** Сводка по спеке: «+2 статуса, −1 статус, 3 кнопки изменены». */
export function publishSummary(
  baseline: WorkflowDraftDocument,
  next: WorkflowDraftDocument,
): string {
  const addedStages = next.stages.filter((s) => !baseline.stages.some((b) => b.id === s.id)).length;
  const removedStages = baseline.stages.filter(
    (s) => !next.stages.some((n) => n.id === s.id),
  ).length;
  const changedTransitions = next.transitions.filter((t) => {
    const before = baseline.transitions.find((b) => b.id === t.id);
    return before && JSON.stringify(before) !== JSON.stringify(t);
  }).length;

  const parts: string[] = [];
  if (addedStages) parts.push(`+${addedStages} ${pluralRu(addedStages, ui.automation.statStages)}`);
  if (removedStages)
    parts.push(`−${removedStages} ${pluralRu(removedStages, ui.automation.statStages)}`);
  if (changedTransitions)
    parts.push(
      `${changedTransitions} ${pluralRu(changedTransitions, ui.automation.buttonsChangedForms)}`,
    );
  return parts.length > 0 ? parts.join(', ') : ui.automation.publishNothingChanged;
}

/**
 * Диалог публикации — сводка изменений; для каждого удаляемого статуса с
 * задачами — обязательный выбор «куда перенести»; конфликт версий (409) —
 * «Загрузить свежую версию» (локальные правки сбрасываются).
 */
export function PublishDialog({
  open,
  onClose,
  workflow,
  baseline,
  document: doc,
  baseVersion,
  publish,
  onPublished,
  onConflictLoad,
}: {
  open: boolean;
  onClose: () => void;
  workflow: WorkflowDetail;
  baseline: WorkflowDraftDocument;
  document: WorkflowDraftDocument;
  baseVersion: number;
  publish: ReturnType<typeof usePublishWorkflow>;
  onPublished: (result: PublishWorkflowResult) => void;
  /** 409: загрузить свежую версию (локальные правки сбрасываются). */
  onConflictLoad: () => void;
}) {
  const removed = baseline.stages.filter((s) => !doc.stages.some((n) => n.id === s.id));
  const removedWithTasks = removed.filter((s) => (workflow.stageTaskCounts[s.id] ?? 0) > 0);
  const restates = baseline.stages
    .map((before) => ({
      before,
      after: doc.stages.find((n) => n.id === before.id),
      count: workflow.stageTaskCounts[before.id] ?? 0,
    }))
    .filter(
      (row) => row.after && row.after.systemState !== row.before.systemState && row.count > 0,
    );

  const [targets, setTargets] = useState<Record<string, string>>({});
  const migrations = useMemo(
    () =>
      removedWithTasks.map((s) => ({
        fromStageId: s.id,
        toStageId: targets[s.id] ?? defaultTargetOf(baseline, doc, s.id),
      })),
    [removedWithTasks, targets, baseline, doc],
  );

  const conflict =
    publish.error instanceof ApiError && publish.error.code === 'WORKFLOW_VERSION_CONFLICT';

  const submit = () =>
    publish.mutate(
      { baseVersion, document: doc, migrations },
      {
        onSuccess: (result) => {
          onPublished(result);
          onClose();
        },
      },
    );

  if (conflict) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui.automation.conflictTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{errorMessages.WORKFLOW_VERSION_CONFLICT}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {ui.automation.conflictCancel}
            </Button>
            <Button onClick={onConflictLoad}>{ui.automation.conflictLoad}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{ui.automation.publishTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{publishSummary(baseline, doc)}</p>

        {removedWithTasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {removedWithTasks.map((stage) => (
              <label key={stage.id} className="flex flex-col gap-1">
                <span className="text-sm">
                  {stage.name} — {workflow.stageTaskCounts[stage.id]}{' '}
                  {ui.automation.publishMigrateTo}:
                </span>
                <select
                  value={targets[stage.id] ?? defaultTargetOf(baseline, doc, stage.id)}
                  onChange={(e) => setTargets((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {doc.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}

        {restates.length > 0 ? (
          <div className="flex flex-col gap-1">
            {restates.map((row) => (
              <p key={row.before.id} className="text-xs text-muted-foreground">
                {row.count} · {row.before.name}: {ui.automation.bands[row.before.systemState]} →{' '}
                {ui.automation.bands[row.after!.systemState]} — {ui.automation.publishRestateNote}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button disabled={publish.isPending} onClick={submit}>
            {ui.automation.publish}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
