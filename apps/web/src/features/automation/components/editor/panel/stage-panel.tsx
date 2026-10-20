import type {
  StageColor,
  TaskSystemState,
  WorkflowDraftDocument,
  WorkflowDraftStage,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Switch } from '@nodus/ui/components/switch';
import { cn } from '@nodus/ui/lib/utils';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';

import { stageColorOrder, stageTone } from '../../../../../shared/ui/board/stage-tone.js';
import { useRouteDocStore } from '../../../model/route-doc-store.js';
import { AddTransitionPopover } from '../add-transition-popover.js';
import { ProcessPreview } from '../process-preview.js';
import { PanelDanger, PanelField, Segmented, focusName } from './panel-kit.js';

const GROUPS: readonly TaskSystemState[] = ['backlog', 'active', 'paused', 'done', 'closed'];

/**
 * Панель статуса (#378 ред. 2): имя, группа (смысловая категория с
 * пояснением, зачем она), цвет, «Начальный статус», «Можно перейти из
 * любого статуса» (на схеме — метка «Любой статус»), итог у группы «Итог»,
 * кнопки из статуса (клик выделяет стрелку), превью панели, удаление.
 */
export function StagePanel({
  stage,
  document: doc,
  taskCount,
  readOnly,
  autoFocusName,
}: {
  stage: WorkflowDraftStage;
  document: WorkflowDraftDocument;
  taskCount: number;
  readOnly: boolean;
  autoFocusName: boolean;
}) {
  const store = useRouteDocStore.getState;
  const patch = (value: Partial<WorkflowDraftStage>) => store().patchStage(stage.id, value);
  const outgoing = doc.transitions
    .filter((t) => t.fromStageId === stage.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const anyButton = doc.transitions.find((t) => t.fromStageId === null && t.toStageId === stage.id);
  const stageName = (id: string) => doc.stages.find((s) => s.id === id)?.name ?? '';

  return (
    <>
      <PanelField label={ui.automation.stageName}>
        <Input
          key={stage.id}
          value={stage.name}
          maxLength={40}
          readOnly={readOnly}
          ref={autoFocusName ? focusName : undefined}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </PanelField>

      <PanelField label={ui.automation.panel.stageGroup} hint={ui.automation.panel.stageGroupWhy}>
        <Select
          value={stage.systemState}
          disabled={readOnly}
          onValueChange={(value) => {
            const systemState = value as TaskSystemState;
            patch({
              systemState,
              outcome: systemState === 'closed' ? (stage.outcome ?? 'success') : null,
            });
          }}
        >
          <SelectTrigger className="w-full min-w-0" aria-label={ui.automation.panel.stageGroup}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="nokey max-w-[352px]">
            {GROUPS.map((group) => (
              <SelectItem key={group} value={group} className="items-start py-1.5">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>{ui.automation.bands[group]}</span>
                  <span className="text-xs whitespace-normal text-muted-foreground">
                    {ui.automation.bandHints[group]}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PanelField>

      <PanelField label={ui.automation.stageColor}>
        <div className="flex flex-wrap gap-2">
          {stageColorOrder.map((tone: StageColor) => (
            <button
              key={tone}
              type="button"
              aria-pressed={stage.color === tone}
              aria-label={ui.tasks.stageColors[tone]}
              title={ui.tasks.stageColors[tone]}
              disabled={readOnly}
              onClick={() => patch({ color: tone })}
              className={cn(
                'size-6 rounded-full border-2 transition-colors',
                stageTone[tone].swatch,
                stage.color === tone ? 'border-foreground' : 'border-transparent',
              )}
            />
          ))}
        </div>
      </PanelField>

      {stage.systemState === 'closed' ? (
        <PanelField label={ui.automation.stageOutcome}>
          <Segmented
            value={stage.outcome ?? 'success'}
            disabled={readOnly}
            options={[
              { value: 'success', label: ui.automation.outcomeSuccess },
              { value: 'cancelled', label: ui.automation.outcomeCancelled },
            ]}
            onChange={(outcome) => patch({ outcome })}
          />
        </PanelField>
      ) : null}

      <label className="flex min-w-0 items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">{ui.automation.isInitial}</span>
          <span className="text-xs break-words text-muted-foreground">
            {ui.automation.isInitialHint}
          </span>
        </span>
        <Switch
          checked={stage.isInitial}
          disabled={readOnly}
          onCheckedChange={(checked) => patch({ isInitial: checked })}
        />
      </label>

      <div className="flex min-w-0 flex-col gap-2">
        <label className="flex min-w-0 items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm">{ui.automation.panel.canAnyFrom}</span>
            <span className="text-xs break-words text-muted-foreground">
              {ui.automation.panel.canAnyFromHint}
            </span>
          </span>
          <Switch
            checked={anyButton !== undefined}
            disabled={readOnly}
            onCheckedChange={(checked) => store().toggleAny(stage.id, checked)}
          />
        </label>
        {anyButton ? (
          <PanelField label={ui.automation.panel.anyButtonName}>
            <Input
              value={anyButton.name}
              maxLength={32}
              readOnly={readOnly}
              onChange={(event) =>
                store().patchTransition(anyButton.id, { name: event.target.value })
              }
            />
          </PanelField>
        ) : null}
      </div>

      <PanelField label={ui.automation.buttonsFromStage}>
        <div className="flex min-w-0 flex-col gap-0.5">
          {outgoing.map((t, index) => (
            <div
              key={t.id}
              className="group -mx-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
            >
              <button
                type="button"
                onClick={() => store().select({ kind: 'transition', id: t.id })}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
              >
                <span className="w-full text-sm break-words">{t.name}</span>
                <span className="w-full text-xs break-words text-muted-foreground">
                  → {stageName(t.toStageId)} · {ui.automation.panel.displaySegments[t.display]}
                </span>
              </button>
              {!readOnly ? (
                <span className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={ui.automation.moveUp}
                    disabled={index === 0}
                    onClick={() => store().moveTransition(t.id, index - 1)}
                    className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
                  >
                    <ArrowUp className="size-3" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label={ui.automation.moveDown}
                    disabled={index === outgoing.length - 1}
                    onClick={() => store().moveTransition(t.id, index + 1)}
                    className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
                  >
                    <ArrowDown className="size-3" strokeWidth={1.75} />
                  </button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {!readOnly ? (
          <AddTransitionPopover
            document={doc}
            defaultFrom={stage.id}
            onPick={(from, to) => store().addTransition(from, to)}
            trigger={
              <Button variant="ghost" size="sm" className="-ml-2 self-start">
                <Plus className="size-3.5" strokeWidth={1.75} />
                {ui.automation.addTransitionLabel}
              </Button>
            }
          />
        ) : null}
      </PanelField>

      <PanelField label={ui.automation.previewTitle}>
        <ProcessPreview transitions={outgoing} />
      </PanelField>

      {!readOnly ? (
        <PanelDanger onClick={() => store().removeStage(stage.id)}>
          {ui.automation.deleteStage}
          {taskCount > 0 ? (
            <span className="ml-1 text-xs text-muted-foreground">
              · {taskCount} {ui.automation.deleteStageTasksNote}
            </span>
          ) : null}
        </PanelDanger>
      ) : null}
    </>
  );
}
