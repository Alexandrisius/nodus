import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  Permission,
  TASK_EVENTS,
  type TaskTransition,
  type TransitionBlockReason,
} from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, planHolderIds } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import {
  effectiveTargetId,
  evaluateValidators,
  outgoingTransitions,
  passesConditions,
  type TransitionDef,
} from './transition-rules.js';
import { WorkflowRepository, type LoadedWorkflow, type StageRow } from './workflow.repository.js';

export interface Actor {
  id: string;
  permissions: readonly string[];
}

/** Чем выбран переход: кнопкой, колонкой глобальной доски или колонкой
 *  «Моего плана» (системное состояние). */
export type TransitionChoice =
  { transitionId: string } | { stageId: string } | { systemState: string };

const OPEN = new Set(['backlog', 'active', 'paused']);

/**
 * Исполнитель маршрутов (ADR-0020): доступные переходы (кнопки с причинами
 * блокировки) и выполнение перехода в транзакции — блокировка строки
 * задачи, условия, гейты (обход — task.override_gate + причина), смена
 * стадии и состояния, completedAt, автоперемещение «Моего плана», события.
 */
@Injectable()
export class TransitionsService {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly tasks: TasksRepository,
    private readonly placements: Placements,
    private readonly eventBus: EventBus,
  ) {}

  async available(tx: TransactionClient, taskId: string, actor: Actor): Promise<TaskTransition[]> {
    const { task, workflow, facts, roles } = await this.context(tx, taskId, actor);
    const canOverride = actor.permissions.includes(Permission.TASK_OVERRIDE_GATE);
    return outgoingTransitions(workflow.transitions, facts, workflow.stages)
      .filter((t) => passesConditions(t.rules, { roles, permissions: actor.permissions }))
      .map((t) => {
        const target = this.stage(workflow, effectiveTargetId(t, task, workflow.stages));
        return {
          id: t.id,
          name: t.name,
          toStageId: target.id,
          toStageName: target.name,
          blockedBy: evaluateValidators(t.rules, facts),
          canOverride,
        };
      });
  }

  /** Выполнить переход (вызывать внутри транзакции сервиса). */
  async execute(
    tx: TransactionClient,
    taskId: string,
    actor: Actor,
    choice: TransitionChoice,
    opts: { override?: boolean; reason?: string } = {},
  ): Promise<StageRow> {
    await this.tasks.lock(tx, taskId);
    const { task, workflow, facts, roles } = await this.context(tx, taskId, actor);
    const candidates = outgoingTransitions(workflow.transitions, facts, workflow.stages)
      .filter((t) => passesConditions(t.rules, { roles, permissions: actor.permissions }))
      .filter((t) => this.matches(t, choice, task, workflow));
    if (candidates.length === 0) {
      throw new DomainException(ErrorCode.TASK_TRANSITION_NOT_ALLOWED, 'Transition not allowed');
    }
    const scored = candidates.map((t) => ({ t, reasons: evaluateValidators(t.rules, facts) }));
    const pick = scored.find((s) => s.reasons.length === 0) ?? scored[0]!;
    if (pick.reasons.length > 0) this.assertOverride(pick.reasons, actor, opts);
    const target = this.stage(workflow, effectiveTargetId(pick.t, task, workflow.stages));
    await this.applyStage(tx, task, target, actor.id, {
      transitionId: pick.t.id,
      overridden: pick.reasons.map((r) => r.kind),
      reason: pick.reasons.length > 0 ? opts.reason : undefined,
    });
    return target;
  }

  private assertOverride(
    reasons: TransitionBlockReason[],
    actor: Actor,
    opts: { override?: boolean; reason?: string },
  ): void {
    if (!opts.override) {
      throw new DomainException(ErrorCode.TASK_TRANSITION_BLOCKED, 'Transition gates not passed', {
        reasons,
      });
    }
    if (!actor.permissions.includes(Permission.TASK_OVERRIDE_GATE)) {
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
    task: { acceptRequired: boolean },
    workflow: LoadedWorkflow,
  ): boolean {
    if ('transitionId' in choice) return t.id === choice.transitionId;
    const target = effectiveTargetId(t, task, workflow.stages);
    if ('stageId' in choice) return target === choice.stageId;
    return this.stage(workflow, target).systemState === choice.systemState;
  }

  private stage(workflow: LoadedWorkflow, id: string): StageRow {
    const stage = workflow.stages.find((s) => s.id === id);
    if (!stage) throw DomainException.notFound('Stage not found');
    return stage;
  }

  private async context(tx: TransactionClient, taskId: string, actor: Actor) {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { participants: true },
    });
    const [workflow, facts] = await Promise.all([
      this.workflows.load(task.workflowId, tx),
      this.tasks.gateFacts(taskId, tx),
    ]);
    return { task, workflow, facts, roles: actorRoles(task, actor.id) };
  }

  /** Смена стадии без проверок маршрута (вызывающий уже проверил). */
  async applyStage(
    tx: TransactionClient,
    task: {
      id: string;
      number: number;
      stageId: string;
      systemState: string;
      creatorId: string;
      assigneeId: string;
      completedAt: Date | null;
      participants: { userId: string; role: string }[];
    },
    target: StageRow,
    actorId: string,
    meta: { transitionId: string | null; overridden?: string[]; reason?: string },
  ): Promise<void> {
    const stateChanged = target.systemState !== task.systemState;
    const closing = !OPEN.has(target.systemState);
    await tx.task.update({
      where: { id: task.id },
      data: {
        stageId: target.id,
        systemState: target.systemState,
        stageOrder: await this.tasks.stageKeyAt(tx, target.id, 0, task.id),
        ...(stateChanged ? { stateChangedAt: new Date() } : {}),
        completedAt: closing ? (task.completedAt ?? new Date()) : null,
      },
    });
    if (stateChanged) {
      await this.placements.sync(
        tx,
        { id: task.id, systemState: target.systemState },
        planHolderIds(task),
        actorId,
      );
    }
    const base = { taskId: task.id, number: task.number, audience: audienceIds(task) };
    const meta2 = { actorId, aggregateType: 'task', aggregateId: task.id };
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.STAGE_CHANGED,
      {
        ...base,
        fromStageId: task.stageId,
        toStageId: target.id,
        toStageName: target.name,
        fromState: task.systemState,
        toState: target.systemState,
        transitionId: meta.transitionId,
        creatorId: task.creatorId,
        assigneeId: task.assigneeId,
        ...(meta.overridden?.length
          ? { overriddenGates: meta.overridden, reason: meta.reason }
          : {}),
      },
      meta2,
    );
    if (stateChanged) {
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.STATUS_CHANGED,
        { ...base, fromState: task.systemState, toState: target.systemState },
        meta2,
      );
    }
    if (closing && OPEN.has(task.systemState)) {
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.COMPLETED,
        { ...base, toState: target.systemState, stageName: target.name, creatorId: task.creatorId },
        meta2,
      );
    }
  }
}
