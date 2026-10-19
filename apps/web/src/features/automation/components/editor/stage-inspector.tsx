import type {
  StageColor,
  StageOutcome,
  TaskSystemState,
  TransitionDisplay,
  WorkflowDraftDocument,
  WorkflowDraftStage,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { Switch } from '@nodus/ui/components/switch';
import { cn } from '@nodus/ui/lib/utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import type { SelectionRef } from '../../model/route-doc-store.js';
import { InspectorPanel } from './inspector-panel.js';
import { ProcessPreview } from './process-preview.js';
import { stageColorOrder, stageTone } from '../../../../shared/ui/board/stage-tone.js';

const BANDS: readonly { state: TaskSystemState; label: string; hint: string }[] = [
  { state: 'backlog', label: ui.automation.bands.backlog, hint: ui.automation.bandHints.backlog },
  { state: 'active', label: ui.automation.bands.active, hint: ui.automation.bandHints.active },
  { state: 'paused', label: ui.automation.bands.paused, hint: ui.automation.bandHints.paused },
  { state: 'done', label: ui.automation.bands.done, hint: ui.automation.bandHints.done },
  { state: 'closed', label: ui.automation.bands.closed, hint: ui.automation.bandHints.closed },
];

const displayLabel: Record<TransitionDisplay, string> = {
  primary: ui.automation.display.primary,
  button: ui.automation.display.button,
  menu: ui.automation.display.menu,
};

/**
 * Инспектор статуса: название, этап с пояснением, цвет, итог (только для
 * «Итога»), начальный статус, кнопки из статуса (упорядоченный список —
 * порядок меняется стрелками и перетаскиванием узла на холсте), живой
 * мини-бар панели процесса, удаление.
 */
export function StageInspector({
  stage,
  document: doc,
  taskCount,
  selection,
  readOnly,
  onClose,
  onPatch,
  onRemove,
  onMoveTransition,
  onSelectTransition,
  onAddTransition,
}: {
  stage: WorkflowDraftStage | null;
  document: WorkflowDraftDocument;
  /** Сколько задач в статусе (предупреждение при удалении). */
  taskCount: number;
  selection: SelectionRef;
  readOnly: boolean;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<WorkflowDraftStage>) => void;
  onRemove: (id: string) => void;
  onMoveTransition: (id: string, index: number) => void;
  onSelectTransition: (ref: SelectionRef) => void;
  onAddTransition: (fromStageId: string) => void;
}) {
  return (
    <InspectorPanel open={stage !== null} title={stage?.name ?? ''} onClose={onClose} wide>
      {stage ? (
        <StageFields
          stage={stage}
          doc={doc}
          taskCount={taskCount}
          readOnly={readOnly}
          selection={selection}
          onPatch={onPatch}
          onRemove={onRemove}
          onMoveTransition={onMoveTransition}
          onSelectTransition={onSelectTransition}
          onAddTransition={onAddTransition}
        />
      ) : null}
    </InspectorPanel>
  );
}

function StageFields({
  stage,
  doc,
  taskCount,
  readOnly,
  selection,
  onPatch,
  onRemove,
  onMoveTransition,
  onSelectTransition,
  onAddTransition,
}: {
  stage: WorkflowDraftStage;
  doc: WorkflowDraftDocument;
  taskCount: number;
  readOnly: boolean;
  selection: SelectionRef;
  onPatch: (id: string, patch: Partial<WorkflowDraftStage>) => void;
  onRemove: (id: string) => void;
  onMoveTransition: (id: string, index: number) => void;
  onSelectTransition: (ref: SelectionRef) => void;
  onAddTransition: (fromStageId: string) => void;
}) {
  const outgoing = doc.transitions
    .filter((t) => t.fromStageId === stage.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const stageName = (id: string | null) =>
    id === null ? ui.automation.anyStage : (doc.stages.find((s) => s.id === id)?.name ?? '');

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.stageName}</span>
        <Input
          value={stage.name}
          maxLength={40}
          readOnly={readOnly}
          onChange={(e) => onPatch(stage.id, { name: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.stageBand}</span>
        <select
          value={stage.systemState}
          disabled={readOnly}
          onChange={(e) => onPatch(stage.id, { systemState: e.target.value as TaskSystemState })}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {BANDS.map((band) => (
            <option key={band.state} value={band.state}>
              {band.label} — {band.hint}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.stageColor}</span>
        <div className="flex gap-2">
          {stageColorOrder.map((tone: StageColor) => (
            <button
              key={tone}
              type="button"
              aria-pressed={stage.color === tone}
              disabled={readOnly}
              onClick={() => onPatch(stage.id, { color: tone })}
              className={cn(
                'size-6 rounded-full border-2 transition-transform',
                stageTone[tone].swatch,
                stage.color === tone ? 'scale-110 border-foreground' : 'border-transparent',
              )}
            />
          ))}
        </div>
      </div>

      {stage.systemState === 'closed' ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-muted-foreground">{ui.automation.stageOutcome}</span>
          <div className="flex gap-1">
            {(['success', 'cancelled'] as const).map((outcome: StageOutcome) => (
              <button
                key={outcome}
                type="button"
                aria-pressed={stage.outcome === outcome}
                disabled={readOnly}
                onClick={() => onPatch(stage.id, { outcome })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  stage.outcome === outcome
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-input',
                )}
              >
                {outcome === 'success'
                  ? ui.automation.outcomeSuccess
                  : ui.automation.outcomeCancelled}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className="text-sm">{ui.automation.isInitial}</span>
          <span className="text-xs text-muted-foreground">{ui.automation.isInitialHint}</span>
        </span>
        <Switch
          checked={stage.isInitial}
          disabled={readOnly}
          onCheckedChange={(checked) => onPatch(stage.id, { isInitial: checked })}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.buttonsFromStage}</span>
        <div className="flex flex-col gap-0.5">
          {outgoing.map((t, index) => (
            <div
              key={t.id}
              className={cn(
                'group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors',
                selection?.kind === 'transition' && selection.id === t.id
                  ? 'bg-accent'
                  : 'hover:bg-accent/50',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectTransition({ kind: 'transition', id: t.id })}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
              >
                <span className="w-full truncate text-sm">{t.name}</span>
                <span className="text-xs text-muted-foreground">→ {stageName(t.toStageId)}</span>
              </button>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {displayLabel[t.display]}
              </span>
              {!readOnly ? (
                <span className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={ui.automation.undo}
                    disabled={index === 0}
                    onClick={() => onMoveTransition(t.id, index - 1)}
                    className="rounded p-0.5 hover:bg-accent"
                  >
                    <ArrowUp className="size-3" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label={ui.automation.redo}
                    disabled={index === outgoing.length - 1}
                    onClick={() => onMoveTransition(t.id, index + 1)}
                    className="rounded p-0.5 hover:bg-accent"
                  >
                    <ArrowDown className="size-3" strokeWidth={1.75} />
                  </button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {!readOnly ? (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onAddTransition(stage.id)}
          >
            <Plus className="size-3.5" />
            {ui.automation.addTransition}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.previewTitle}</span>
        <ProcessPreview transitions={outgoing} />
      </div>

      {!readOnly ? (
        <Button
          variant="ghost"
          className="mt-auto justify-start text-danger hover:text-danger"
          onClick={() => onRemove(stage.id)}
        >
          <Trash2 className="size-3.5" />
          {ui.automation.deleteStage}
          {taskCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              · {taskCount} {ui.automation.deleteStageTasksNote}
            </span>
          ) : null}
        </Button>
      ) : null}
    </>
  );
}
