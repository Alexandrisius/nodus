import {
  Permission,
  workflowTransitionRulesSchema,
  type TaskActorRole,
  type TaskRequirableField,
  type TransitionBlockReason,
  type WorkflowTransitionRules,
} from '@nodus/contracts';

/**
 * Движок правил перехода (ADR-0020) — чистые функции: условия «кто»
 * (conditions), гейты DoR/DoD (validators), выбор фактической цели
 * (postFunctions route_if_accept_required). Сервис кормит их фактами задачи
 * и исполняет результат в транзакции.
 */

export interface TransitionDef {
  id: string;
  name: string;
  fromStageId: string | null;
  toStageId: string;
  sortOrder: number;
  rules: WorkflowTransitionRules;
}

export interface StageDef {
  id: string;
  code: string | null;
  name: string;
  systemState: string;
  archivedAt: Date | null;
}

/** Факты задачи для гейтов (собираются репозиторием одним запросом). */
export interface TaskGateFacts {
  stageId: string;
  acceptRequired: boolean;
  openSubtasks: number;
  checklistDone: number;
  checklistTotal: number;
  spentMinutes: number;
  description: string;
  deadline: Date | null;
  assigneeId: string | null;
  plannedMinutes: number | null;
  hasResult: boolean;
}

export interface ActorContext {
  roles: ReadonlySet<TaskActorRole>;
  permissions: readonly string[];
}

/** Разбор правил из БД: неизвестный вид — ошибка (ложной безопасности нет). */
export function parseRules(raw: unknown): WorkflowTransitionRules {
  return workflowTransitionRulesSchema.parse(raw ?? {});
}

/** Может ли актор нажать кнопку (условия «кто»). task.manage_any — всегда;
 *  пустые условия — постановщик или ответственный (правка задачи). */
export function passesConditions(rules: WorkflowTransitionRules, actor: ActorContext): boolean {
  if (actor.permissions.includes(Permission.TASK_MANAGE_ANY)) return true;
  if (rules.conditions.length === 0) {
    return actor.roles.has('creator') || actor.roles.has('assignee');
  }
  return rules.conditions.some((c) =>
    c.kind === 'role_in'
      ? c.roles.some((role) => actor.roles.has(role))
      : actor.permissions.includes(c.permission),
  );
}

function missingFields(fields: TaskRequirableField[], facts: TaskGateFacts): TaskRequirableField[] {
  const filled: Record<TaskRequirableField, boolean> = {
    description: facts.description.trim().length > 0,
    deadline: facts.deadline !== null,
    assignee: facts.assigneeId !== null,
    plannedMinutes: facts.plannedMinutes !== null,
    result: facts.hasResult,
  };
  return fields.filter((f) => !filled[f]);
}

/** Гейты DoR/DoD: список невыполненных (пусто — переход разрешён). */
export function evaluateValidators(
  rules: WorkflowTransitionRules,
  facts: TaskGateFacts,
): TransitionBlockReason[] {
  const reasons: TransitionBlockReason[] = [];
  for (const v of rules.validators) {
    switch (v.kind) {
      case 'no_open_subtasks':
        if (facts.openSubtasks > 0) reasons.push({ kind: v.kind, count: facts.openSubtasks });
        break;
      case 'checklist_complete':
        if (facts.checklistDone < facts.checklistTotal) reasons.push({ kind: v.kind });
        break;
      case 'fields_required': {
        const fields = missingFields(v.fields, facts);
        if (fields.length > 0) reasons.push({ kind: v.kind, fields });
        break;
      }
      case 'time_logged':
        if (facts.spentMinutes <= 0) reasons.push({ kind: v.kind });
        break;
      case 'result_present':
        if (!facts.hasResult) reasons.push({ kind: v.kind });
        break;
    }
  }
  return reasons;
}

/** Фактическая цель перехода: «Завершить» при acceptRequired ведёт в
 *  стадию контроля (postFunction route_if_accept_required). */
export function effectiveTargetId(
  transition: TransitionDef,
  facts: Pick<TaskGateFacts, 'acceptRequired'>,
  stages: readonly StageDef[],
): string {
  for (const pf of transition.rules.postFunctions) {
    if (pf.kind === 'route_if_accept_required' && facts.acceptRequired) {
      const target = stages.find((s) => s.code === pf.stageCode && !s.archivedAt);
      if (target) return target.id;
    }
  }
  return transition.toStageId;
}

/** Переходы из текущей стадии (включая «из любой»), кроме петли в себя. */
export function outgoingTransitions(
  transitions: readonly TransitionDef[],
  facts: Pick<TaskGateFacts, 'stageId' | 'acceptRequired'>,
  stages: readonly StageDef[],
): TransitionDef[] {
  return transitions
    .filter((t) => t.fromStageId === null || t.fromStageId === facts.stageId)
    .filter((t) => effectiveTargetId(t, facts, stages) !== facts.stageId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
