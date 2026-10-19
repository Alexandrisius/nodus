import type {
  TransitionDisplay,
  WorkflowDraftDocument,
  WorkflowDraftTransition,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';
import { Trash2 } from 'lucide-react';

import type { SelectionRef } from '../../model/route-doc-store.js';
import { InspectorPanel } from './inspector-panel.js';
import { TransitionRulesEditor } from './transition-rules-editor.js';

/**
 * Инспектор кнопки (перехода): название (= подпись кнопки в карточке),
 * откуда/куда, показ, кто видит (роли, минимум одна), условия перехода
 * (валидаторы DoR/DoD), особый случай «постановщик сам себе исполнитель».
 */
export function TransitionInspector({
  transition,
  document: doc,
  readOnly,
  onClose,
  onPatch,
  onSetPrimary,
  onRemove,
}: {
  transition: WorkflowDraftTransition | null;
  document: WorkflowDraftDocument;
  readOnly: boolean;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<WorkflowDraftTransition>) => void;
  onSetPrimary: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <InspectorPanel
      open={transition !== null}
      title={transition?.name ?? ''}
      onClose={onClose}
      wide
    >
      {transition ? (
        <TransitionFields
          transition={transition}
          doc={doc}
          readOnly={readOnly}
          onPatch={onPatch}
          onSetPrimary={onSetPrimary}
          onRemove={onRemove}
        />
      ) : null}
    </InspectorPanel>
  );
}

function TransitionFields({
  transition,
  doc,
  readOnly,
  onPatch,
  onSetPrimary,
  onRemove,
}: {
  transition: WorkflowDraftTransition;
  doc: WorkflowDraftDocument;
  readOnly: boolean;
  onPatch: (id: string, patch: Partial<WorkflowDraftTransition>) => void;
  onSetPrimary: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = transition;

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.transitionName}</span>
        <Input
          value={t.name}
          maxLength={32}
          readOnly={readOnly}
          onChange={(e) => onPatch(t.id, { name: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">{ui.automation.transitionNameHint}</span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-label text-muted-foreground">{ui.automation.fromStage}</span>
          <select
            value={t.fromStageId ?? ''}
            disabled={readOnly}
            onChange={(e) =>
              onPatch(t.id, { fromStageId: e.target.value === '' ? null : e.target.value })
            }
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">{ui.automation.anyStage}</option>
            {doc.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-label text-muted-foreground">{ui.automation.toStage}</span>
          <select
            value={t.toStageId}
            disabled={readOnly}
            onChange={(e) => onPatch(t.id, { toStageId: e.target.value })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {doc.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.displayLabel}</span>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['primary', 'button', 'menu'] as const).map((display: TransitionDisplay) => (
            <button
              key={display}
              type="button"
              aria-pressed={t.display === display}
              disabled={readOnly}
              onClick={() =>
                display === 'primary' ? onSetPrimary(t.id) : onPatch(t.id, { display })
              }
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                t.display === display
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {displayLabel[display]}
            </button>
          ))}
        </div>
      </div>

      <TransitionRulesEditor transition={t} doc={doc} readOnly={readOnly} onPatch={onPatch} />

      {!readOnly ? (
        <Button
          variant="ghost"
          className="mt-auto justify-start text-danger hover:text-danger"
          onClick={() => onRemove(t.id)}
        >
          <Trash2 className="size-3.5" />
          {ui.automation.deleteTransition}
        </Button>
      ) : null}
    </>
  );
}

const displayLabel: Record<TransitionDisplay, string> = {
  primary: ui.automation.display.primary,
  button: ui.automation.display.button,
  menu: ui.automation.display.menu,
};

export type { SelectionRef };
