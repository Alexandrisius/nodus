import { useMemo, useState } from 'react';
import type { TaskDetail, TaskType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { useAliveTaskTypes, useChangeTaskType } from '../../../shared/api/task-types-api.js';
import { useWorkflowDetail } from '../../../shared/workflow/workflow-api.js';
import { TaskTypeGlyph } from '../../../shared/workflow/task-type-icon.js';

/**
 * Смена типа задачи (#378): список доступных типов (значок, название,
 * описание); если текущего статуса нет в новом маршруте — выбор статуса
 * (дефолт: первый живой того же этапа, иначе начальный).
 */
export function TaskChangeTypeDialog({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const { data: types } = useAliveTaskTypes();
  const change = useChangeTaskType(task.id);
  const [typeId, setTypeId] = useState(task.type.id);
  const selected = useMemo(() => (types ?? []).find((t) => t.id === typeId), [types, typeId]);
  const workflow = useWorkflowDetail(selected?.workflowId ?? null);
  const stages = workflow.data?.document.stages ?? [];
  const stageMissing = selected !== undefined && !stages.some((s) => s.id === task.stage.id);
  const defaultStage =
    stages.find((s) => s.systemState === task.stage.systemState) ?? stages.find((s) => s.isInitial);
  const [stageId, setStageId] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{ui.tasks.changeTypeTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {(types ?? [])
            .filter((t) => t.id !== task.type.id)
            .map((type: TaskType) => (
              <button
                key={type.id}
                type="button"
                aria-pressed={typeId === type.id}
                onClick={() => {
                  setTypeId(type.id);
                  setStageId(null);
                }}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                  typeId === type.id ? 'border-ring bg-accent' : 'border-border hover:border-input',
                )}
              >
                <TaskTypeGlyph
                  icon={type.icon}
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm">{type.name}</span>
                  {type.description ? (
                    <span className="text-xs text-muted-foreground">{type.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
        </div>
        {stageMissing && stages.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-muted-foreground">{ui.tasks.changeTypeStage}</span>
            <select
              value={stageId ?? defaultStage?.id ?? ''}
              onChange={(e) => setStageId(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            disabled={change.isPending || !selected || (stageMissing && stages.length === 0)}
            onClick={() =>
              selected &&
              change.mutate(
                stageMissing
                  ? { typeId: selected.id, stageId: stageId ?? defaultStage?.id }
                  : { typeId: selected.id },
                { onSuccess: onClose },
              )
            }
          >
            {ui.tasks.changeTypeSubmit}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
