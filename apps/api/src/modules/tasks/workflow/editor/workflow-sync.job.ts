import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { TransactionRunner } from '../../../../core/database/transaction-runner.js';
import { planHolderIds } from '../../access/task-access.js';
import { Placements } from '../../personal/placements.js';
import { TasksRepository } from '../../tasks/tasks.repository.js';
import { StageMover } from '../stage-mover.js';
import { WorkflowRepository } from '../workflow.repository.js';

export const WORKFLOW_SYNC_QUEUE = 'tasks-workflow-sync';
const PREFIX = 'nodus';
const BATCH = 100;

export interface SyncJobData {
  workflowId: string;
  version: number;
  moves: { fromStageId: string; toStageId: string }[];
  restates: { stageId: string; systemState: string }[];
}

/**
 * Фоновый перенос задач публикации маршрута (#378, ADR-0021): BullMQ-задание
 * `tasks-workflow-sync` с jobId `<workflowId>__v<version>` (дедуп повторной
 * доставки события; BullMQ запрещает ':' в custom jobId). Ставит его
 * outbox-обработчик `task.workflow_published` (WorkflowPublishedHandler).
 * Повторы — attempts + экспоненциальный backoff. Идемпотентно: перенос
 * берёт задачи архивированной стадии пачками по 100, повтор ничего не
 * находит. Смена стадии и смена группы — общий помощник StageMover
 * (события, «Мой план», completedAt).
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
    private readonly tasks: TasksRepository,
    private readonly workflows: WorkflowRepository,
    private readonly placements: Placements,
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
    this.worker.on('failed', (job, error) =>
      this.logger.warn(
        { err: error, attempt: job?.attemptsMade, jobId: job?.id },
        'Перенос задач маршрута упал (повтор с backoff)',
      ),
    );
  }

  /** Постановка задания (вызывает outbox-обработчик; jobId — дедуп версии). */
  async schedule(data: SyncJobData): Promise<void> {
    if (data.moves.length === 0 && data.restates.length === 0) return;
    await this.queue!.add('sync', data, {
      jobId: `${data.workflowId}__v${data.version}`,
      attempts: 8,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 20,
      removeOnFail: 100,
    });
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
        await this.prepareHolders(row.id);
        await this.txRunner.run(async (tx) => {
          await this.tasks.lock(tx, row.id);
          const task = await this.tasks.findWithParticipants(row.id, tx);
          const target = await this.workflows.findStageById(toStageId, tx);
          if (!task || !target || task.stageId !== fromStageId) return;
          await this.mover.apply(tx, task, target, null, {
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
  private async restateBatched(stageId: string, systemState: string): Promise<number> {
    let restated = 0;
    for (;;) {
      const batch = await this.workflows.taskIdsToRestate(stageId, systemState, BATCH);
      if (batch.length === 0) break;
      for (const row of batch) {
        await this.prepareHolders(row.id);
        await this.txRunner.run(async (tx) => {
          await this.tasks.lock(tx, row.id);
          const task = await this.tasks.findWithParticipants(row.id, tx);
          if (task) await this.mover.restate(tx, task, systemState);
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

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
