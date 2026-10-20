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

/** Почему меняется стадия (поле `cause` события stage_changed). */
export type StageChangeCause = 'transition' | 'workflow_migration' | 'type_change';

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
   *  `overrideReason` — текст причины обхода гейта (история, ADR-0020). */
  async apply(
    tx: TransactionClient,
    task: MovableTask,
    target: Pick<StageRow, 'id' | 'name' | 'systemState' | 'outcome'>,
    actorId: string | null,
    meta: {
      transitionId: string | null;
      cause: StageChangeCause;
      overridden?: string[];
      overrideReason?: string;
    },
  ): Promise<void> {
    const stateChanged = target.systemState !== task.systemState;
    await this.tasks.moveToStage(tx, task.id, {
      stageId: target.id,
      stageOrder: await this.tasks.stageKeyAt(tx, target.id, 0, task.id),
      ...this.stateFields(task, target.systemState),
    });
    const base = { taskId: task.id, number: task.number, audience: audienceIds(task) };
    const meta2 = { actorId, aggregateType: 'task', aggregateId: task.id };
    const overridden = meta.overridden?.length ? meta.overridden : undefined;
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
        coexecutorIds: task.participants
          .filter((p) => p.role === 'coexecutor')
          .map((p) => p.userId),
        cause: meta.cause,
        ...(overridden ? { overriddenGates: overridden, reason: meta.overrideReason } : {}),
      },
      meta2,
    );
    if (stateChanged) await this.afterStateChange(tx, task, target.systemState, actorId);
    if (!OPEN.has(target.systemState) && OPEN.has(task.systemState)) {
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.COMPLETED,
        { ...base, toState: target.systemState, stageName: target.name, creatorId: task.creatorId },
        meta2,
      );
    }
  }

  /** Стадия сменила группу (публикация маршрута): задача остаётся в своей
   *  стадии, пересчитываются состояние, completedAt и «Мой план». */
  async restate(tx: TransactionClient, task: MovableTask, systemState: string): Promise<void> {
    if (task.systemState === systemState) return;
    await this.tasks.setState(tx, task.id, this.stateFields(task, systemState));
    await this.afterStateChange(tx, task, systemState, null);
  }

  private stateFields(task: MovableTask, systemState: string) {
    const closing = !OPEN.has(systemState);
    return {
      systemState,
      ...(systemState !== task.systemState ? { stateChangedAt: new Date() } : {}),
      completedAt: closing ? (task.completedAt ?? new Date()) : null,
    };
  }

  private async afterStateChange(
    tx: TransactionClient,
    task: MovableTask,
    systemState: string,
    actorId: string | null,
  ): Promise<void> {
    await this.placements.sync(tx, { id: task.id, systemState }, planHolderIds(task), actorId);
    const base = { taskId: task.id, number: task.number, audience: audienceIds(task) };
    const meta = { actorId, aggregateType: 'task', aggregateId: task.id };
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.STATUS_CHANGED,
      { ...base, fromState: task.systemState, toState: systemState },
      meta,
    );
  }
}
