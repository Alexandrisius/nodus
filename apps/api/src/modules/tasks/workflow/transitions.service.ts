import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  Permission,
  type AuthUser,
  type ExecuteTransitionBody,
  type TaskListItem,
  type TaskTransition,
  type TransitionBlockReason,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { actorRoles, planHolderIds } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { TasksService } from '../tasks/tasks.service.js';
import { StageMover } from './stage-mover.js';
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

/**
 * Исполнитель маршрутов (ADR-0020): доступные переходы (кнопки с причинами
 * блокировки, показом и итогом цели) и выполнение перехода в транзакции —
 * блокировка строки задачи, условия, гейты (обход — task.override_gate +
 * причина), смена стадии (общий помощник StageMover). Сценарии API «кнопки
 * маршрута» (listFor/executeFor) — здесь же: видимость, подготовка личных
 * маршрутов, транзакция, ответ (контроллер тонкий).
 */
@Injectable()
export class TransitionsService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly workflows: WorkflowRepository,
    private readonly tasks: TasksRepository,
    private readonly placements: Placements,
    private readonly query: TasksQueryService,
    private readonly taskService: TasksService,
    private readonly mover: StageMover,
  ) {}

  /** GET /tasks/:id/transitions — кнопки маршрута видимой задачи. */
  async listFor(user: AuthUser, taskId: string): Promise<TaskTransition[]> {
    await this.query.visibleRow(user, taskId);
    return this.txRunner.run((tx) => this.available(tx, taskId, user));
  }

  /** POST /tasks/:id/transitions/:transitionId — выполнить кнопку. Личные
   *  маршруты держателей готовятся ДО транзакции (ensurePersonal). */
  async executeFor(
    user: AuthUser,
    taskId: string,
    transitionId: string,
    body: ExecuteTransitionBody,
  ): Promise<TaskListItem> {
    const row = await this.query.visibleRow(user, taskId);
    await this.placements.prepare(planHolderIds(row));
    await this.txRunner.run((tx) => this.execute(tx, taskId, user, { transitionId }, body));
    return this.taskService.listItem(user.id, taskId);
  }

  async available(tx: TransactionClient, taskId: string, actor: Actor): Promise<TaskTransition[]> {
    const { task, workflow, facts, roles } = await this.context(tx, taskId, actor);
    const canOverride = actor.permissions.includes(Permission.TASK_OVERRIDE_GATE);
    return outgoingTransitions(workflow.transitions, facts, workflow.stages)
      .filter((t) => passesConditions(t.rules, { roles, permissions: actor.permissions }))
      .map((t) => {
        const target = this.stage(
          workflow,
          effectiveTargetId(t, this.routeFacts(task), workflow.stages),
        );
        return {
          id: t.id,
          name: t.name,
          toStageId: target.id,
          toStageName: target.name,
          toStageState: target.systemState as TaskTransition['toStageState'],
          toStageOutcome: (target.outcome ?? null) as TaskTransition['toStageOutcome'],
          display: t.display,
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
    const target = this.stage(
      workflow,
      effectiveTargetId(pick.t, this.routeFacts(task), workflow.stages),
    );
    await this.mover.apply(tx, task, target, actor.id, {
      transitionId: pick.t.id,
      overridden: pick.reasons.map((r) => r.kind),
      reason: 'transition',
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
    task: { acceptRequired: boolean; creatorId: string; assigneeId: string | null },
    workflow: LoadedWorkflow,
  ): boolean {
    if ('transitionId' in choice) return t.id === choice.transitionId;
    const target = effectiveTargetId(t, this.routeFacts(task), workflow.stages);
    if ('stageId' in choice) return target === choice.stageId;
    return this.stage(workflow, target).systemState === choice.systemState;
  }

  /** Факты route_if из задачи (creator_is_assignee, #378). */
  private routeFacts(task: {
    acceptRequired: boolean;
    creatorId: string;
    assigneeId: string | null;
  }) {
    return {
      acceptRequired: task.acceptRequired,
      creatorIsAssignee: task.creatorId === task.assigneeId,
    };
  }

  private stage(workflow: LoadedWorkflow, id: string): StageRow {
    const stage = workflow.stages.find((s) => s.id === id);
    if (!stage) throw DomainException.notFound('Stage not found');
    return stage;
  }

  private async context(tx: TransactionClient, taskId: string, actor: Actor) {
    const task = await this.tasks.findWithParticipants(taskId, tx);
    const [workflow, facts] = await Promise.all([
      this.workflows.load(task.workflowId, tx),
      this.tasks.gateFacts(taskId, tx),
    ]);
    return { task, workflow, facts, roles: actorRoles(task, actor.id) };
  }
}
