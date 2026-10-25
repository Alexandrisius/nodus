import { Injectable } from '@nestjs/common';
import { ErrorCode, type ProcessCategory, type WorkflowTransition } from '@nodus/contracts';

import type { TransactionClient } from '../../../../core/database/transaction-runner.js';
import { DomainException } from '../../../../core/errors/domain-exception.js';
import type {
  WorkflowActor,
  WorkflowActorSubject,
  WorkflowEntityStage,
  WorkflowStageChangeMeta,
} from '../../../../core/ports/workflow-entity.port.js';
import type { TransitionChoice, WorkflowEnginePort } from '../../ports/workflow-engine.port.js';
import {
  effectiveTargetId,
  evaluateValidators,
  outgoingTransitions,
  passesConditions,
  type TransitionDef,
} from '../transition-rules.js';
import { WorkflowEntityRegistry } from './entity-adapter.registry.js';
import { WorkflowRepository, type LoadedWorkflow, type StageRow } from '../workflow.repository.js';

/**
 * Движок маршрутов «Процессов» (ADR-0020/ADR-0024): доступные переходы
 * (кнопки с причинами блокировки, показом и итогом цели) и выполнение
 * перехода в транзакции вызывающего — блокировка сущности, условия, гейты
 * (обход — флаг адаптера + причина), смена стадии адаптером категории.
 * Движок не знает ни таблиц сущностей, ни их прав и ролей: всё это отдаёт
 * адаптер (порт `WorkflowEntityAdapter`). Журнал переходов — #380.
 */
/** Субъект адаптера + права актора: движок заполняет `permissions` сам —
 *  условия `permission` проверяются одинаково в `available` и `execute`. */
type EngineSubject = WorkflowActorSubject & { permissions: readonly string[] };

@Injectable()
export class WorkflowEngine implements WorkflowEnginePort {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly adapters: WorkflowEntityRegistry,
  ) {}

  async available(
    tx: TransactionClient,
    entityId: string,
    category: ProcessCategory,
    actor: WorkflowActor,
  ): Promise<WorkflowTransition[]> {
    const { workflow, subject } = await this.context(tx, entityId, category, actor);
    return this.options(workflow, subject);
  }

  async execute(
    tx: TransactionClient,
    entityId: string,
    category: ProcessCategory,
    actor: WorkflowActor,
    choice: TransitionChoice,
    opts: { override?: boolean; reason?: string } = {},
  ): Promise<WorkflowEntityStage> {
    const adapter = this.adapters.get(category);
    await adapter.lock(tx, entityId);
    const subject = await this.subjectWithPermissions(tx, entityId, category, actor);
    const workflow = await this.workflows.load(subject.workflowId, tx);
    const candidates = outgoingTransitions(workflow.transitions, subject.facts, workflow.stages)
      .filter((t) => passesConditions(t.rules, subject))
      .filter((t) => this.matches(t, choice, subject, workflow));
    if (candidates.length === 0) {
      // Имя текущего статуса — клиент собирает понятную строку (I15):
      // «Из статуса «В работе» так перейти нельзя» (перенос в «Моём плане»).
      const from = workflow.stages.find((s) => s.id === subject.stageId);
      throw new DomainException(ErrorCode.TASK_TRANSITION_NOT_ALLOWED, 'Transition not allowed', {
        ...(from ? { fromStageName: from.name } : {}),
      });
    }
    const scored = candidates.map((t) => ({
      t,
      reasons: evaluateValidators(t.rules, subject.facts),
    }));
    const pick = scored.find((s) => s.reasons.length === 0) ?? scored[0]!;
    if (pick.reasons.length > 0) this.assertOverride(pick.reasons, subject, opts);
    const target = this.stage(workflow, effectiveTargetId(pick.t, subject.facts, workflow.stages));
    await adapter.applyStage(tx, entityId, target, actor.id, {
      transitionId: pick.t.id,
      cause: 'transition',
      overriddenGates: pick.reasons.map((r) => r.kind),
      overrideReason: pick.reasons.length > 0 ? opts.reason?.trim() : undefined,
    } satisfies WorkflowStageChangeMeta);
    return target;
  }

  private assertOverride(
    reasons: { kind: string }[],
    subject: WorkflowActorSubject,
    opts: { override?: boolean; reason?: string },
  ): void {
    if (!opts.override) {
      throw new DomainException(ErrorCode.TASK_TRANSITION_BLOCKED, 'Transition gates not passed', {
        reasons,
      });
    }
    if (!subject.canOverrideGates) {
      throw DomainException.forbidden('Gate override requires task.override_gate');
    }
    if (!opts.reason?.trim()) {
      throw new DomainException(
        ErrorCode.TASK_OVERRIDE_REASON_REQUIRED,
        'Override reason required',
      );
    }
  }

  private matches(
    t: TransitionDef,
    choice: TransitionChoice,
    subject: WorkflowActorSubject,
    workflow: LoadedWorkflow,
  ): boolean {
    if ('transitionId' in choice) return t.id === choice.transitionId;
    const target = effectiveTargetId(t, subject.facts, workflow.stages);
    if ('stageId' in choice) return target === choice.stageId;
    return this.stage(workflow, target).systemState === choice.systemState;
  }

  private options(workflow: LoadedWorkflow, subject: EngineSubject): WorkflowTransition[] {
    return outgoingTransitions(workflow.transitions, subject.facts, workflow.stages)
      .filter((t) => passesConditions(t.rules, subject))
      .map((t) => {
        const target = this.stage(workflow, effectiveTargetId(t, subject.facts, workflow.stages));
        return {
          id: t.id,
          name: t.name,
          toStageId: target.id,
          toStageName: target.name,
          toStageState: target.systemState as WorkflowTransition['toStageState'],
          toStageOutcome: (target.outcome ?? null) as WorkflowTransition['toStageOutcome'],
          toStageColor: target.color as WorkflowTransition['toStageColor'],
          toStageOrder: target.sortOrder,
          display: t.display,
          blockedBy: evaluateValidators(t.rules, subject.facts),
          canOverride: subject.canOverrideGates,
        };
      });
  }

  private stage(workflow: LoadedWorkflow, id: string): StageRow {
    const stage = workflow.stages.find((s) => s.id === id);
    if (!stage) throw DomainException.notFound('Stage not found');
    return stage;
  }

  private async context(
    tx: TransactionClient,
    entityId: string,
    category: ProcessCategory,
    actor: WorkflowActor,
  ): Promise<{ workflow: LoadedWorkflow; subject: EngineSubject }> {
    const subject = await this.subjectWithPermissions(tx, entityId, category, actor);
    return { workflow: await this.workflows.load(subject.workflowId, tx), subject };
  }

  /** Субъект адаптера + права актора: условия `permission` проверяет движок,
   *  и в `available`, и в `execute` — иначе кнопка видна, а нажатие падает. */
  private async subjectWithPermissions(
    tx: TransactionClient,
    entityId: string,
    category: ProcessCategory,
    actor: WorkflowActor,
  ): Promise<EngineSubject> {
    const subject = await this.adapters.get(category).subject(tx, entityId, actor);
    return { ...subject, permissions: actor.permissions };
  }
}
