import type {
  WorkflowActorRole,
  WorkflowRequirableField,
  WorkflowDraftDocument,
  WorkflowDraftTransition,
  WorkflowValidator,
} from '@nodus/contracts';

/**
 * Чистые правки правил кнопки (#378): кто видит (роли — минимум одна),
 * условия перехода (DoR/DoD-валидаторы, поля, мягкий гейт подзадач
 * `allowReview`), особое правило `route_if` «постановщик сам себе
 * исполнитель». Панель только вызывает их и патчит rules целиком.
 */

type Rules = WorkflowDraftTransition['rules'];

export const ACTOR_ROLES: readonly WorkflowActorRole[] = [
  'creator',
  'assignee',
  'coexecutor',
  'observer',
];
export const VALIDATOR_KINDS = [
  'no_open_subtasks',
  'checklist_complete',
  'time_logged',
  'result_present',
  'fields_required',
] as const;
export type ValidatorKind = (typeof VALIDATOR_KINDS)[number];
export const REQUIRABLE_FIELDS: readonly WorkflowRequirableField[] = [
  'description',
  'deadline',
  'assignee',
  'plannedMinutes',
  'result',
];

export function rolesOf(rules: Rules): Set<WorkflowActorRole> {
  return new Set(rules.conditions.flatMap((c) => (c.kind === 'role_in' ? c.roles : [])));
}

/** Роль вкл/выкл; последнюю снять нельзя (кнопку должен кто-то видеть). */
export function toggleRole(rules: Rules, role: WorkflowActorRole): Rules {
  const roles = rolesOf(rules);
  if (roles.has(role)) roles.delete(role);
  else roles.add(role);
  if (roles.size === 0) return rules;
  const list = ACTOR_ROLES.filter((r) => roles.has(r));
  const others = rules.conditions.filter((c) => c.kind !== 'role_in');
  return { ...rules, conditions: [{ kind: 'role_in', roles: list }, ...others] };
}

export function validatorOf<K extends WorkflowValidator['kind']>(
  rules: Rules,
  kind: K,
): Extract<WorkflowValidator, { kind: K }> | undefined {
  return rules.validators.find(
    (v): v is Extract<WorkflowValidator, { kind: K }> => v.kind === kind,
  );
}

export function toggleValidator(rules: Rules, kind: ValidatorKind): Rules {
  if (validatorOf(rules, kind)) {
    return { ...rules, validators: rules.validators.filter((v) => v.kind !== kind) };
  }
  const added: WorkflowValidator =
    kind === 'fields_required' ? { kind, fields: ['description'] } : { kind };
  return { ...rules, validators: [...rules.validators, added] };
}

/** Мягкий гейт: подзадачи на утверждении не мешают (по умолчанию — мешают). */
export function setAllowReview(rules: Rules, allow: boolean): Rules {
  return {
    ...rules,
    validators: rules.validators.map((v) =>
      v.kind === 'no_open_subtasks' ? (allow ? { ...v, allowReview: true } : { kind: v.kind }) : v,
    ),
  };
}

/** Поле обязательного заполнения вкл/выкл (последнее не снимается). */
export function toggleField(rules: Rules, field: WorkflowRequirableField): Rules {
  const validator = validatorOf(rules, 'fields_required');
  if (!validator) return rules;
  const fields = new Set(validator.fields);
  if (fields.has(field)) fields.delete(field);
  else fields.add(field);
  if (fields.size === 0) return rules;
  return {
    ...rules,
    validators: rules.validators.map((v) =>
      v.kind === 'fields_required'
        ? { kind: v.kind, fields: REQUIRABLE_FIELDS.filter((f) => fields.has(f)) }
        : v,
    ),
  };
}

export function routeIfOf(rules: Rules): string | null {
  const rule = rules.postFunctions.find((p) => p.kind === 'route_if');
  return rule && rule.kind === 'route_if' ? rule.toStageId : null;
}

/** Особое правило: цель или выкл (null). */
export function setRouteIf(rules: Rules, toStageId: string | null): Rules {
  const rest = rules.postFunctions.filter((p) => p.kind !== 'route_if');
  return {
    ...rules,
    postFunctions:
      toStageId === null
        ? rest
        : [...rest, { kind: 'route_if', when: 'creator_is_assignee', toStageId }],
  };
}

/** Цель по умолчанию при включении особого правила: успешный итог не цель. */
export function defaultRouteIfTarget(
  doc: WorkflowDraftDocument,
  transition: WorkflowDraftTransition,
): string | null {
  const success = doc.stages.find(
    (s) => s.systemState === 'closed' && s.outcome === 'success' && s.id !== transition.toStageId,
  );
  return success?.id ?? doc.stages.find((s) => s.id !== transition.toStageId)?.id ?? null;
}
