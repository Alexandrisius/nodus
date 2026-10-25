import { Injectable } from '@nestjs/common';
import { isCompletedState, isFinalState, TASK_EVENTS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import type {
  WorkflowEntityStage,
  WorkflowStageChangeCause,
} from '../../../core/ports/workflow-entity.port.js';
import { audienceIds, planHolderIds } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksRepository } from '../tasks/tasks.repository.js';

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
export type StageChangeCause = WorkflowStageChangeCause;

/**
 * Общий доменный помощник смены стадии задачи (#378, спека фазы 3): правила
 * completedAt, автоперемещение «Моего плана» и события — в ОДНОЙ точке для
 * кнопок маршрута, фонового переноса публикации, смены типа и пересчёта
 * группы статуса (иначе — копии правил). Завершение — только вход в «Итог»
 * (фаза final, ADR-0020 дополнение 2): «Утверждение» (review) не ставит
 * completedAt и не шлёт task.completed. Вызывается ТОЛЬКО внутри
 * транзакции вызывающего сервиса.
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
    target: WorkflowEntityStage,
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
    // Выполнена: вход в «Итог» с исходом «выполнена» из незавершённого
    // (из работы или с утверждения); отмена — только stage_changed с
    // toStageOutcome: cancelled.
    const completes =
      isCompletedState(target.systemState, target.outcome) && !isFinalState(task.systemState);
    if (completes) {
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

  /** completedAt — момент входа в «Итог»: ставится при входе, сохраняется
   *  между итогами (отменена ↔ выполнена), снимается при выходе. */
  private stateFields(task: MovableTask, systemState: string) {
    const now = new Date();
    const stayedFinal = isFinalState(task.systemState) && task.completedAt !== null;
    return {
      systemState,
      ...(systemState !== task.systemState ? { stateChangedAt: now } : {}),
      completedAt: isFinalState(systemState) ? (stayedFinal ? task.completedAt : now) : null,
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
