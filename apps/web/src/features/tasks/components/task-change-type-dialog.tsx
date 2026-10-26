import { useMemo, useState } from 'react';
import type { TaskDetail, ProcessType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';
import { Button } from '@nodus/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { cn } from '@nodus/ui/lib/utils';

import {
  useAliveProcessTypes,
  useChangeProcessType,
} from '../../../shared/api/process-types-api.js';
import { useWorkflowDetail } from '../../../shared/workflow/workflow-api.js';
import { typeViewerOf } from '@nodus/contracts';
import { ProcessTypeGlyph } from '../../../shared/workflow/process-type-icon.js';

/**
 * Смена типа задачи (#378): список доступных типов (значок, название,
 * описание); если текущего статуса нет в новом маршруте — выбор статуса
 * (дефолт: первый живой того же этапа, иначе начальный).
 */
export function TaskChangeTypeDialog({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const { data: types } = useAliveProcessTypes();
  const change = useChangeProcessType(task.id);
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
            // Сменить тип можно только на тот, который сотруднику разрешено
            // создавать (#432, Р6); сервер всё равно ответит 403.
            .filter((t) => t.id !== task.type.id && typeViewerOf(t).canCreate)
            .map((type: ProcessType) => (
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
                <ProcessTypeGlyph
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
            <Select value={stageId ?? defaultStage?.id ?? ''} onValueChange={setStageId}>
              <SelectTrigger className="w-full min-w-0" aria-label={ui.tasks.changeTypeStage}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
