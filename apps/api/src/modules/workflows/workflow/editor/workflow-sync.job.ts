import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ProcessCategory } from '@nodus/contracts';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { WorkflowEntityRegistry } from '../engine/entity-adapter.registry.js';
import { WorkflowRepository } from '../workflow.repository.js';

export const WORKFLOW_SYNC_QUEUE = 'workflows-sync';
const PREFIX = 'nodus';

export interface SyncJobData {
  workflowId: string;
  version: number;
  /** Категория сущностей маршрута: по ней выбирается адаптер владельца. */
  category: ProcessCategory;
  moves: { fromStageId: string; toStageId: string }[];
  restates: { stageId: string; systemState: string }[];
}

/**
 * Фоновый перенос сущностей публикации маршрута (#378, ADR-0021; «Процессы» —
 * ADR-0024): BullMQ-задание `workflows-sync` с jobId `<workflowId>__v<version>`
 * (дедуп повторной доставки события; BullMQ запрещает ':' в custom jobId).
 * Ставит его outbox-обработчик `workflow.published`. Само перемещение и
 * пересчёт группы делает адаптер категории (модуль-владелец сущности):
 * движок не знает его таблиц. Повторы — attempts + экспоненциальный backoff;
 * идемпотентно: адаптер берёт сущности пачками, повтор ничего не находит.
 */
@Injectable()
export class WorkflowSyncJob implements OnModuleInit, OnModuleDestroy {
  // Подключения живут с onModuleInit (не с конструктора): юнит-тесты
  // конструируют задание без Redis, прод — валидирует env на старте.
  private connection?: Redis;
  private queue?: Queue<SyncJobData>;
  private worker?: Worker<SyncJobData>;

  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly adapters: WorkflowEntityRegistry,
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
        'Перенос сущностей маршрута упал (повтор с backoff)',
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

  /** Один прогон (public для тестов): число тронутых сущностей. */
  async run(data: SyncJobData): Promise<number> {
    const adapter = this.adapters.get(data.category);
    let touched = 0;
    for (const move of data.moves) {
      const target = await this.workflows.findStageById(move.toStageId);
      if (!target) continue;
      touched += await adapter.migrateStage(move.fromStageId, target);
    }
    for (const restate of data.restates) {
      touched += await adapter.restateStage(restate.stageId, restate.systemState);
    }
    if (touched > 0) {
      this.logger.info(
        { workflowId: data.workflowId, version: data.version, touched },
        'workflows: перенос сущностей публикации выполнен',
      );
    }
    return touched;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
