import { Injectable } from '@nestjs/common';
import { TASK_EVENTS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { audienceIds, planHolderIds } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import type { StageRow } from './workflow.repository.js';

const OPEN = new Set(['backlog', 'active', 'paused']);

export interface MovableTask {
  id: string;
  number: number;
  stageId: string;
  systemState: string;
  creatorId: string;
  assigneeId: string;
  completedAt: Date | null;
  participants: { userId: string; role: string }[];
}

/**
 * Общий доменный помощник смены стадии задачи (#378, спека фазы 3): правила
 * completedAt, автоперемещение «Моего плана» и события — в ОДНОЙ точке для
 * кнопок маршрута, фонового переноса публикации и смены типа (иначе — три
 * копии правил). Вызывается ТОЛЬКО внутри транзакции вызывающего сервиса.
 */
@Injectable()
export class StageMover {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly placements: Placements,
    private readonly eventBus: EventBus,
  ) {}

  /** Смена стадии без проверок маршрута (вызывающий уже проверил).
   *  `reason` маркирует событие stage_changed: кнопка / миграция / тип. */
  async apply(
    tx: TransactionClient,
    task: MovableTask,
    target: Pick<StageRow, 'id' | 'name' | 'systemState' | 'outcome'>,
    actorId: string | null,
    meta: {
      transitionId: string | null;
      overridden?: string[];
      reason?: 'transition' | 'workflow_migration' | 'type_change';
    },
  ): Promise<void> {
    const stateChanged = target.systemState !== task.systemState;
    const closing = !OPEN.has(target.systemState);
    await this.tasks.moveToStage(tx, task.id, {
      stageId: target.id,
      systemState: target.systemState,
      stageOrder: await this.tasks.stageKeyAt(tx, target.id, 0, task.id),
      ...(stateChanged ? { stateChangedAt: new Date() } : {}),
      completedAt: closing ? (task.completedAt ?? new Date()) : null,
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
        toStageOutcome: target.outcome as 'success' | 'cancelled' | null,
        transitionId: meta.transitionId,
        creatorId: task.creatorId,
        assigneeId: task.assigneeId,
        ...(meta.reason ? { reason: meta.reason } : {}),
        ...(meta.overridden?.length ? { overriddenGates: meta.overridden } : {}),
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
