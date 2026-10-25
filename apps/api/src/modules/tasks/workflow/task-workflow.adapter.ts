import { Injectable } from '@nestjs/common';
import { Permission } from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import type {
  WorkflowActor,
  WorkflowActorSubject,
  WorkflowEntityAdapter,
  WorkflowEntityStage,
  WorkflowStageChangeMeta,
} from '../../../core/ports/workflow-entity.port.js';
import { actorRoles, planHolderIds } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { StageMover } from './stage-mover.js';

/** Пачка переноса/пересчёта задач публикации (своя транзакция на задачу). */
const BATCH = 100;

/**
 * Адаптер задач для движка «Процессов» (ADR-0024): категория `task`.
 * Регистрируется в реестре по статическому `workflowCategory` (DiscoveryService).
 * Роли актора, флаги прав и факты гейтов — задачные; движок их не знает.
 * Смена стадии — общий помощник StageMover (события, «Мой план», completedAt).
 * Перенос и пересчёт публикации — пачками, своя транзакция на задачу,
 * идемпотентно (повтор ничего не находит).
 */
@Injectable()
export class TaskWorkflowAdapter implements WorkflowEntityAdapter {
  static readonly workflowCategory = 'task';
  readonly category = TaskWorkflowAdapter.workflowCategory;

  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly tasks: TasksRepository,
    private readonly placements: Placements,
    private readonly mover: StageMover,
  ) {}

  lock(tx: TransactionClient, taskId: string): Promise<void> {
    return this.tasks.lock(tx, taskId);
  }

  async subject(
    tx: TransactionClient,
    taskId: string,
    actor: WorkflowActor,
  ): Promise<WorkflowActorSubject> {
    const task = await this.tasks.findWithParticipants(taskId, tx);
    const roles = actorRoles(task, actor.id);
    return {
      workflowId: task.workflowId,
      stageId: task.stageId,
      roles: new Set<string>(roles),
      bypassConditions: actor.permissions.includes(Permission.TASK_MANAGE_ANY),
      canOverrideGates: actor.permissions.includes(Permission.TASK_OVERRIDE_GATE),
      actsWithoutConditions: roles.has('creator') || roles.has('assignee'),
      facts: await this.tasks.gateFacts(taskId, tx),
    };
  }

  async applyStage(
    tx: TransactionClient,
    taskId: string,
    target: WorkflowEntityStage,
    actorId: string | null,
    meta: WorkflowStageChangeMeta,
  ): Promise<void> {
    const task = await this.tasks.findWithParticipants(taskId, tx);
    await this.mover.apply(tx, task, target, actorId, meta);
  }

  async countByStages(
    stageIds: readonly string[],
    tx?: TransactionClient,
  ): Promise<Record<string, number>> {
    if (stageIds.length === 0) return {};
    const rows = await this.tasks.countByStages(stageIds, tx);
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.stageId] = row.count;
    return counts;
  }

  /** Перенос задач архивированной стадии пачками keyset (идемпотентно:
   *  стадия уже архивирована, но задачи остаются до переноса). */
  async migrateStage(fromStageId: string, toStage: WorkflowEntityStage): Promise<number> {
    let moved = 0;
    for (;;) {
      const batch = await this.tasks.idsByStage(fromStageId, BATCH);
      if (batch.length === 0) break;
      for (const { id } of batch) {
        await this.prepareHolders(id);
        await this.txRunner.run(async (tx) => {
          await this.tasks.lock(tx, id);
          const task = await this.tasks.findWithParticipants(id, tx);
          if (task.stageId !== fromStageId) return;
          await this.mover.apply(tx, task, toStage, null, {
            transitionId: null,
            cause: 'workflow_migration',
          });
        });
        moved += 1;
      }
    }
    return moved;
  }

  /** Смена группы статуса: состояние, completedAt и «Мой план» каждой задачи. */
  async restateStage(stageId: string, systemState: string): Promise<number> {
    let restated = 0;
    for (;;) {
      const batch = await this.tasks.idsToRestate(stageId, systemState, BATCH);
      if (batch.length === 0) break;
      for (const { id } of batch) {
        await this.prepareHolders(id);
        await this.txRunner.run(async (tx) => {
          await this.tasks.lock(tx, id);
          const task = await this.tasks.findWithParticipants(id, tx);
          await this.mover.restate(tx, task, systemState);
        });
        restated += 1;
      }
    }
    return restated;
  }

  /** Личные маршруты держателей — до транзакции (как у кнопок маршрута). */
  private async prepareHolders(taskId: string): Promise<void> {
    const roster = await this.txRunner.run((tx) => this.tasks.findLiveRoster(taskId, tx));
    if (roster) await this.placements.prepare(planHolderIds(roster));
  }
}
