import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { TASK_EVENTS } from '@nodus/contracts';

import { TransactionRunner } from '../../../../core/database/transaction-runner.js';
import { EventBus } from '../../../../core/events/event-bus.js';
import { audienceIds } from '../../access/task-access.js';
import { TasksRepository } from '../../tasks/tasks.repository.js';
import { StageMover } from '../stage-mover.js';
import { WorkflowRepository } from '../workflow.repository.js';
import type { PublishOutcome } from './publish.service.js';

export const WORKFLOW_SYNC_QUEUE = 'tasks-workflow-sync';
const PREFIX = 'nodus';
const BATCH = 100;

interface SyncJobData {
  workflowId: string;
  version: number;
  moves: { fromStageId: string; toStageId: string }[];
  restates: { stageId: string; systemState: string }[];
}

/**
 * Фоновый перенос задач публикации маршрута (#378, ADR-0021): BullMQ-задание
 * `tasks-workflow-sync` с jobId `<workflowId>:<version>` (дедуп повторной
 * публикации). Идемпотентно: перенос берёт задачи архивированной стадии
 * пачками по 100 (keyset), повторный прогон ничего не находит. Смена стадии
 * — общий доменный помощник StageMover (события, «Мой план», completedAt);
 * смена этапа стадии — денормализация + `task.status_changed` каждой задаче.
 */
@Injectable()
export class WorkflowSyncJob implements OnModuleInit, OnModuleDestroy {
  // Подключения живут с onModuleInit (не с конструктора): юнит-тесты
  // конструируют задание без Redis, прод — валидирует env на старте.
  private connection?: Redis;
  private queue?: Queue<SyncJobData>;
  private worker?: Worker<SyncJobData>;

  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly tasks: TasksRepository,
    private readonly workflows: WorkflowRepository,
    private readonly mover: StageMover,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkflowSyncJob.name);
  }

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue<SyncJobData>(WORKFLOW_SYNC_QUEUE, {
      connection: this.connection,
      prefix: PREFIX,
    });
    this.worker = new Worker<SyncJobData>(
      WORKFLOW_SYNC_QUEUE,
      async (job) => void (await this.run(job.data)),
      { connection: this.connection.duplicate(), prefix: PREFIX, concurrency: 1 },
    );
    this.worker.on('failed', (_job, error) =>
      this.logger.warn({ err: error }, 'Перенос задач маршрута упал (BullMQ повторит)'),
    );
  }

  /** Постановка задания после коммита публикации (jobId = дедуп версии). */
  async schedule(outcome: PublishOutcome): Promise<void> {
    if (outcome.moves.length === 0 && outcome.restates.length === 0) return;
    await this.queue!.add(
      'sync',
      {
        workflowId: outcome.workflowId,
        version: outcome.version,
        moves: outcome.moves,
        restates: outcome.restates,
      },
      {
        // BullMQ запрещает ':' в custom jobId («Custom Id cannot contain :»,
        // поймано интеграционным тестом #378) — дедуп-ключ через '__'.
        jobId: `${outcome.workflowId}__v${outcome.version}`,
        removeOnComplete: 20,
        removeOnFail: 100,
      },
    );
  }

  /** Один прогон (public для тестов): число тронутых задач. */
  async run(data: SyncJobData): Promise<number> {
    let touched = 0;
    for (const move of data.moves) {
      touched += await this.moveBatched(move.fromStageId, move.toStageId);
    }
    for (const restate of data.restates) {
      touched += await this.restateBatched(restate.stageId, restate.systemState);
    }
    if (touched > 0) {
      this.logger.info(
        { workflowId: data.workflowId, version: data.version, touched },
        'tasks: перенос задач публикации выполнен',
      );
    }
    return touched;
  }

  /** Перенос задач архивированной стадии пачками keyset (идемпотентно:
   *  стадия уже архивирована, но задачи остаются до переноса). */
  private async moveBatched(fromStageId: string, toStageId: string): Promise<number> {
    let moved = 0;
    for (;;) {
      const batch = await this.workflows.taskIdsOfStage(fromStageId, BATCH);
      if (batch.length === 0) break;
      for (const row of batch) {
        await this.txRunner.run(async (tx) => {
          await this.tasks.lock(tx, row.id);
          const task = await this.tasks.findWithParticipants(row.id, tx);
          const target = await tx.workflowStage.findUnique({ where: { id: toStageId } });
          if (!task || !target || task.stageId !== fromStageId) return;
          await this.mover.apply(tx, task, target, null, {
            transitionId: null,
            reason: 'workflow_migration',
          });
        });
        moved += 1;
      }
    }
    return moved;
  }

  /** Смена этапа стадии: денормализация systemState/completedAt + событие
   *  `task.status_changed` каждой задаче («Мой план» слушает его). */
  private async restateBatched(stageId: string, systemState: string): Promise<number> {
    let restated = 0;
    for (;;) {
      const batch = await this.workflows.taskIdsToRestate(stageId, systemState, BATCH);
      if (batch.length === 0) break;
      for (const row of batch) {
        await this.txRunner.run(async (tx) => {
          await this.tasks.lock(tx, row.id);
          const task = await this.tasks.findWithParticipants(row.id, tx);
          if (!task || task.systemState === systemState) return;
          const now = new Date();
          const closing = !['backlog', 'active', 'paused'].includes(systemState);
          await tx.task.update({
            where: { id: task.id },
            data: {
              systemState,
              stateChangedAt: now,
              completedAt: closing ? (task.completedAt ?? now) : null,
            },
          });
          await this.eventBus.emit(
            tx,
            TASK_EVENTS.STATUS_CHANGED,
            {
              taskId: task.id,
              number: task.number,
              audience: audienceIds(task),
              fromState: task.systemState,
              toState: systemState,
            },
            { actorId: null, aggregateType: 'task', aggregateId: task.id },
          );
        });
        restated += 1;
      }
    }
    return restated;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
