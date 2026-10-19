import type {
  TaskActorRole,
  TaskRequirableField,
  TransitionDisplay,
  WorkflowDraftDocument,
  WorkflowDraftTransition,
  WorkflowValidator,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { Switch } from '@nodus/ui/components/switch';
import { cn } from '@nodus/ui/lib/utils';
import { Trash2 } from 'lucide-react';

import type { SelectionRef } from '../../model/route-doc-store.js';
import { InspectorPanel } from './inspector-panel.js';

const ROLES: readonly TaskActorRole[] = ['creator', 'assignee', 'coexecutor', 'observer'];
const roleLabel: Record<TaskActorRole, string> = {
  creator: ui.automation.roles.creator,
  assignee: ui.automation.roles.assignee,
  coexecutor: ui.automation.roles.coexecutor,
  observer: ui.automation.roles.observer,
};
const fieldLabel: Record<TaskRequirableField, string> = {
  description: ui.automation.requirableFields.description,
  deadline: ui.automation.requirableFields.deadline,
  assignee: ui.automation.requirableFields.assignee,
  plannedMinutes: ui.automation.requirableFields.plannedMinutes,
  result: ui.tasks.result,
};
const validatorKinds = [
  'no_open_subtasks',
  'checklist_complete',
  'time_logged',
  'result_present',
  'fields_required',
] as const;

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
  const roles = new Set(t.rules.conditions.flatMap((c) => (c.kind === 'role_in' ? c.roles : [])));
  const validators = new Set(t.rules.validators.map((v) => v.kind));
  const requiredFields = new Set(
    t.rules.validators.flatMap((v) => (v.kind === 'fields_required' ? v.fields : [])),
  );
  const routeIf = t.rules.postFunctions.find((p) => p.kind === 'route_if');

  const patchRules = (mutate: (rules: WorkflowDraftTransition['rules']) => void) => {
    const rules = structuredClone(t.rules);
    mutate(rules);
    onPatch(t.id, { rules });
  };

  const toggleRole = (role: TaskActorRole) =>
    patchRules((rules) => {
      const condition = rules.conditions.find((c) => c.kind === 'role_in');
      const next = new Set(roles);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      const list = [...next];
      if (list.length === 0) return; // «выбор хотя бы одного обязателен»
      if (condition && condition.kind === 'role_in') condition.roles = list;
      else rules.conditions.push({ kind: 'role_in', roles: list });
    });

  const toggleValidator = (kind: (typeof validatorKinds)[number]) =>
    patchRules((rules) => {
      if (validators.has(kind)) {
        rules.validators = rules.validators.filter((v) => v.kind !== kind);
      } else if (kind === 'fields_required') {
        rules.validators.push({ kind, fields: ['description'] });
      } else {
        rules.validators.push({ kind } as WorkflowValidator);
      }
    });

  const toggleField = (field: TaskRequirableField) =>
    patchRules((rules) => {
      const condition = rules.validators.find(
        (v): v is Extract<WorkflowValidator, { kind: 'fields_required' }> =>
          v.kind === 'fields_required',
      );
      if (!condition) return;
      const next = new Set(condition.fields);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      condition.fields = [...next];
    });

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

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.whoSees}</span>
        <div className="flex flex-wrap gap-1">
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={roles.has(role)}
              disabled={readOnly}
              onClick={() => toggleRole(role)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                roles.has(role)
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-input',
              )}
            >
              {roleLabel[role]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{ui.automation.whoSeesHint}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{ui.automation.conditions}</span>
        <div className="flex flex-wrap gap-1">
          {validatorKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={validators.has(kind)}
              disabled={readOnly}
              onClick={() => toggleValidator(kind)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                validators.has(kind)
                  ? 'border-transparent bg-accent text-foreground'
                  : 'border-border text-muted-foreground hover:border-input',
              )}
            >
              {ui.automation.validators[kind]}
            </button>
          ))}
        </div>
        {validators.has('fields_required') ? (
          <div className="flex flex-wrap gap-1 pl-2">
            {(['description', 'deadline', 'assignee', 'plannedMinutes', 'result'] as const).map(
              (field) => (
                <button
                  key={field}
                  type="button"
                  aria-pressed={requiredFields.has(field)}
                  disabled={readOnly}
                  onClick={() => toggleField(field)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    requiredFields.has(field)
                      ? 'border-transparent bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:border-input',
                  )}
                >
                  {fieldLabel[field]}
                </button>
              ),
            )}
          </div>
        ) : null}
        <span className="text-xs text-muted-foreground">{ui.automation.conditionsHint}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">{ui.automation.specialCase}</span>
          <Switch
            checked={routeIf !== undefined}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              patchRules((rules) => {
                rules.postFunctions = rules.postFunctions.filter((p) => p.kind !== 'route_if');
                if (checked) {
                  const fallback = doc.stages.find(
                    (s) =>
                      s.systemState === 'closed' && s.outcome === 'success' && s.id !== t.toStageId,
                  );
                  if (fallback) {
                    rules.postFunctions.push({
                      kind: 'route_if',
                      when: 'creator_is_assignee',
                      toStageId: fallback.id,
                    });
                  }
                }
              })
            }
          />
        </label>
        {routeIf && routeIf.kind === 'route_if' ? (
          <select
            value={routeIf.toStageId}
            disabled={readOnly}
            onChange={(e) =>
              patchRules((rules) => {
                const pf = rules.postFunctions.find((p) => p.kind === 'route_if');
                if (pf && pf.kind === 'route_if') pf.toStageId = e.target.value;
              })
            }
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {doc.stages
              .filter((s) => s.id !== t.toStageId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        ) : null}
      </div>

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
