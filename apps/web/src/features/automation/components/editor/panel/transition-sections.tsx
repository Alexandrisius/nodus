import type { WorkflowDraftDocument, WorkflowDraftTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

import { useRouteDocStore } from '../../../model/route-doc-store.js';
import {
  ACTOR_ROLES,
  REQUIRABLE_FIELDS,
  VALIDATOR_KINDS,
  defaultRouteIfTarget,
  rolesOf,
  routeIfOf,
  setAllowReview,
  setRouteIf,
  toggleField,
  toggleRole,
  toggleValidator,
  validatorOf,
} from '../../../model/transition-rules.js';
import { PanelField, SwitchRow } from './panel-kit.js';

/**
 * Разделы панели кнопки (#378 ред. 2, «переход внутрь» как в Трекере):
 * «Кто видит», «Условия перехода» (DoD: подзадачи с галочкой «на утверждении
 * не мешают», чек-лист, время, итог, поля), «Особые правила» (route_if).
 * Структура позволяет добавить разделы эпика (окно перехода, утверждающие)
 * без переделки.
 */

type Rules = WorkflowDraftTransition['rules'];

function usePatchRules(transition: WorkflowDraftTransition) {
  return (next: Rules) => {
    if (next !== transition.rules) {
      useRouteDocStore.getState().patchTransition(transition.id, { rules: next });
    }
  };
}

function CheckRow({
  checked,
  disabled,
  title,
  hint,
  onChange,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  title: string;
  hint?: string;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="flex min-w-0 items-start gap-2.5">
        <Checkbox
          className="mt-0.5"
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">{title}</span>
          {hint ? <span className="text-xs break-words text-muted-foreground">{hint}</span> : null}
        </span>
      </label>
      {children ? <div className="flex min-w-0 flex-col gap-2 pl-6.5">{children}</div> : null}
    </div>
  );
}

export function RolesSection({
  transition,
  readOnly,
}: {
  transition: WorkflowDraftTransition;
  readOnly: boolean;
}) {
  const patch = usePatchRules(transition);
  const roles = rolesOf(transition.rules);
  return (
    <>
      {ACTOR_ROLES.map((role) => (
        <CheckRow
          key={role}
          checked={roles.has(role)}
          // Последнюю роль снять нельзя — кнопку должен кто-то видеть.
          disabled={readOnly || (roles.has(role) && roles.size === 1)}
          title={ui.automation.roles[role]}
          onChange={() => patch(toggleRole(transition.rules, role))}
        />
      ))}
      <p className="text-xs break-words text-muted-foreground">{ui.automation.whoSeesHint}</p>
    </>
  );
}

export function ConditionsSection({
  transition,
  readOnly,
}: {
  transition: WorkflowDraftTransition;
  readOnly: boolean;
}) {
  const patch = usePatchRules(transition);
  const rules = transition.rules;
  const subtasks = validatorOf(rules, 'no_open_subtasks');
  const fields = validatorOf(rules, 'fields_required');
  return (
    <>
      <p className="text-sm break-words text-muted-foreground">
        {ui.automation.panel.conditionsLead}
      </p>
      {VALIDATOR_KINDS.map((kind) => (
        <CheckRow
          key={kind}
          checked={validatorOf(rules, kind) !== undefined}
          disabled={readOnly}
          title={ui.automation.validators[kind]}
          hint={ui.automation.panel.validatorHints[kind]}
          onChange={() => patch(toggleValidator(rules, kind))}
        >
          {kind === 'no_open_subtasks' && subtasks ? (
            <CheckRow
              checked={subtasks.allowReview === true}
              disabled={readOnly}
              title={ui.automation.panel.allowReviewSubtasks}
              onChange={(checked) => patch(setAllowReview(rules, checked))}
            />
          ) : null}
          {kind === 'fields_required' && fields
            ? REQUIRABLE_FIELDS.map((field) => (
                <CheckRow
                  key={field}
                  checked={fields.fields.includes(field)}
                  disabled={
                    readOnly || (fields.fields.length === 1 && fields.fields.includes(field))
                  }
                  title={
                    field === 'result' ? ui.tasks.result : ui.automation.requirableFields[field]
                  }
                  onChange={() => patch(toggleField(rules, field))}
                />
              ))
            : null}
        </CheckRow>
      ))}
      <p className="text-xs break-words text-muted-foreground">{ui.automation.conditionsHint}</p>
    </>
  );
}

export function RulesSection({
  transition,
  document: doc,
  readOnly,
}: {
  transition: WorkflowDraftTransition;
  document: WorkflowDraftDocument;
  readOnly: boolean;
}) {
  const patch = usePatchRules(transition);
  const target = routeIfOf(transition.rules);
  return (
    <>
      <SwitchRow
        title={ui.automation.panel.routeIfToggle}
        hint={ui.automation.panel.routeIfHint}
        checked={target !== null}
        disabled={readOnly}
        onChange={(checked) =>
          patch(
            setRouteIf(transition.rules, checked ? defaultRouteIfTarget(doc, transition) : null),
          )
        }
      />
      {target !== null ? (
        <PanelField label={ui.automation.panel.routeIfTarget}>
          <Select
            value={target}
            disabled={readOnly}
            onValueChange={(value) => patch(setRouteIf(transition.rules, value))}
          >
            <SelectTrigger
              className="w-full min-w-0"
              aria-label={ui.automation.panel.routeIfTarget}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="nokey">
              {doc.stages
                .filter((s) => s.id !== transition.toStageId)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </PanelField>
      ) : null}
    </>
  );
}
