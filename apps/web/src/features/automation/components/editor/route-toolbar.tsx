import { useReactFlow } from '@xyflow/react';
import type { TaskSystemState, WorkflowProblem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Maximize2, Minus, Plus, Redo2, Undo2 } from 'lucide-react';

import { ProblemsChip } from './problems-chip.js';

/**
 * Строка инструментов над холстом (широкая, h-14, border-b — горизонталь
 * шапок канона): слева — создание статуса (меню этапа) и кнопки перехода,
 * undo/redo, «Упорядочить»; справа — чип версии маршрута, проблемы,
 * отмена/публикация и зум. Без права управления — бейдж «Только просмотр».
 */

const BANDS: readonly { state: TaskSystemState; hint: string }[] = [
  { state: 'backlog', hint: ui.automation.bandHints.backlog },
  { state: 'active', hint: ui.automation.bandHints.active },
  { state: 'paused', hint: ui.automation.bandHints.paused },
  { state: 'done', hint: ui.automation.bandHints.done },
  { state: 'closed', hint: ui.automation.bandHints.closed },
];

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function RouteToolbar({
  canManage,
  dirty,
  publishedAt,
  publishedBy,
  problems,
  canUndo,
  canRedo,
  publishBlocked,
  onUndo,
  onRedo,
  onTidy,
  onProblemClick,
  onDiscard,
  onPublish,
  onAddStage,
  onAddTransition,
}: {
  canManage: boolean;
  dirty: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  problems: readonly WorkflowProblem[];
  canUndo: boolean;
  canRedo: boolean;
  publishBlocked: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTidy: () => void;
  onProblemClick: (problem: WorkflowProblem) => void;
  onDiscard: () => void;
  onPublish: () => void;
  onAddStage: (band: TaskSystemState) => void;
  onAddTransition: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;

  return (
    <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border px-3">
      {canManage ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-3.5" strokeWidth={1.75} />
                {ui.automation.addStage}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>{ui.automation.stageBand}</DropdownMenuLabel>
              {BANDS.map((band) => (
                <DropdownMenuItem
                  key={band.state}
                  onClick={() => onAddStage(band.state)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="text-sm">{ui.automation.bands[band.state]}</span>
                  <span className="text-xs text-muted-foreground">{band.hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={onAddTransition}>
            <Plus className="size-3.5" strokeWidth={1.75} />
            {ui.automation.addTransition}
          </Button>
          <span aria-hidden className="mx-1 h-6 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui.automation.undo}
            title={`${ui.automation.undo} (Ctrl+Z)`}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="size-4" strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui.automation.redo}
            title={`${ui.automation.redo} (Ctrl+Shift+Z)`}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="size-4" strokeWidth={1.75} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onTidy}>
            {ui.automation.tidyUp}
          </Button>
        </>
      ) : (
        <span className="rounded-full border border-border bg-accent/40 px-2.5 py-1 text-xs text-muted-foreground">
          {ui.automation.readOnly}
        </span>
      )}

      <div className="flex-1" />

      {dirty ? (
        <span
          className="shrink-0 rounded-full border border-warning/40 bg-warning-soft/60 px-2.5 py-1 text-xs text-warning"
          title={ui.automation.chipDraft}
        >
          {ui.automation.chipDraft}
        </span>
      ) : publishedAt ? (
        <span
          className="shrink-0 rounded-full border border-border bg-accent/40 px-2.5 py-1 font-mono text-xs tabular-nums text-muted-foreground"
          title={`${ui.automation.chipPublishedAt} ${formatDate(publishedAt)}${publishedBy ? ` · ${publishedBy}` : ''}`}
        >
          {formatDate(publishedAt)}
        </span>
      ) : null}

      {problems.length > 0 ? (
        <ProblemsChip
          errors={errors}
          warnings={warnings}
          problems={problems}
          onProblemClick={onProblemClick}
        />
      ) : null}

      {canManage && dirty ? (
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          {ui.automation.discard}
        </Button>
      ) : null}
      {canManage ? (
        <Button
          size="sm"
          disabled={publishBlocked || errors > 0}
          title={errors > 0 ? `${ui.automation.problemsFixFirst} ${errors}` : undefined}
          onClick={onPublish}
        >
          {ui.automation.publish}
        </Button>
      ) : null}

      <span aria-hidden className="mx-1 h-6 w-px bg-border" />
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={ui.automation.zoomOut}
          onClick={() => void zoomOut({ duration: 150 })}
        >
          <Minus className="size-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={ui.automation.fitView}
          title={ui.automation.fitView}
          onClick={() => void fitView({ duration: 200, padding: 0.2 })}
        >
          <Maximize2 className="size-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={ui.automation.zoomIn}
          onClick={() => void zoomIn({ duration: 150 })}
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
