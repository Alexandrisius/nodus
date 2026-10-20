import {
  isFinalState,
  Permission,
  workflowTransitionRulesSchema,
  type TaskActorRole,
  type TaskRequirableField,
  type TransitionBlockReason,
  type TransitionDisplay,
  type WorkflowTransitionRules,
} from '@nodus/contracts';

/**
 * Движок правил перехода (ADR-0020, редактор #378) — чистые функции: условия
 * «кто» (conditions), гейты DoR/DoD (validators), показ кнопки (display) и
 * выбор фактической цели (postFunctions route_if). Архивные переходы
 * отфильтровываются репозиторием ДО parseRules — правила мёртвых кнопок не
 * исполняются. Сервис кормит функции фактами задачи и исполняет результат
 * в транзакции.
 */

export interface TransitionDef {
  id: string;
  name: string;
  fromStageId: string | null;
  toStageId: string;
  display: TransitionDisplay;
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

/** Факты задачи для гейтов и route_if (собираются репозиторием). */
export interface TaskGateFacts {
  stageId: string;
  acceptRequired: boolean;
  /** Постановщик сам себе исполнитель — особый случай route_if (#378). */
  creatorIsAssignee: boolean;
  /** Живые подзадачи фазы open (работа не сдана). */
  openSubtasks: number;
  /** Живые подзадачи фазы review (на утверждении) — мешают в строгом
   *  режиме гейта no_open_subtasks (ADR-0020, дополнение 2). */
  reviewSubtasks: number;
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
      case 'no_open_subtasks': {
        const count = facts.openSubtasks + (v.allowReview ? 0 : facts.reviewSubtasks);
        if (count > 0) reasons.push({ kind: v.kind, count });
        break;
      }
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

/** Фактическая цель перехода: пост-функции route_if подменяют цель при
 *  совпадении условия (цель мертва — игнор и warn вызывающему; маршрут
 *  проверяет принадлежность при публикации). Устаревший
 *  route_if_accept_required работает как раньше (каталог ревизии 1). */
export function effectiveTargetId(
  transition: TransitionDef,
  facts: Pick<TaskGateFacts, 'acceptRequired' | 'creatorIsAssignee'>,
  stages: readonly StageDef[],
): string {
  for (const pf of transition.rules.postFunctions) {
    if (pf.kind === 'route_if' && facts.creatorIsAssignee) {
      const target = stages.find((s) => s.id === pf.toStageId && !s.archivedAt);
      if (target) return target.id;
    }
    if (pf.kind === 'route_if_accept_required' && facts.acceptRequired) {
      const target = stages.find((s) => s.code === pf.stageCode && !s.archivedAt);
      if (target) return target.id;
    }
  }
  return transition.toStageId;
}

/** Живая стадия по id (архивная — как отсутствующая). */
export function liveStage(stages: readonly StageDef[], id: string): StageDef | undefined {
  return stages.find((s) => s.id === id && !s.archivedAt);
}

/**
 * Кнопки из текущей стадии: сначала кнопки статуса, затем «из любого»,
 * внутри групп — по sortOrder; петля в себя скрыта; кнопка «из любого»
 * скрыта между двумя этапами «Итог» (закрытую задачу «отменять» нельзя).
 */
export function outgoingTransitions(
  transitions: readonly TransitionDef[],
  facts: Pick<TaskGateFacts, 'stageId' | 'acceptRequired' | 'creatorIsAssignee'>,
  stages: readonly StageDef[],
): TransitionDef[] {
  const current = stages.find((s) => s.id === facts.stageId);
  const currentFinal = current !== undefined && isFinalState(current.systemState);
  const fromStage = transitions
    .filter((t) => t.fromStageId === facts.stageId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const fromAny = transitions
    .filter((t) => t.fromStageId === null)
    .filter((t) => {
      if (!currentFinal) return true;
      const target = liveStage(stages, effectiveTargetId(t, facts, stages));
      return target === undefined || !isFinalState(target.systemState);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return [...fromStage, ...fromAny].filter(
    (t) => effectiveTargetId(t, facts, stages) !== facts.stageId,
  );
}
