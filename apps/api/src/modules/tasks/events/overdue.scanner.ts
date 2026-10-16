import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { TASK_EVENTS } from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { audienceIds } from '../access/task-access.js';
import { TasksRepository } from '../tasks/tasks.repository.js';

export const OVERDUE_QUEUE = 'task-overdue';
const PREFIX = 'nodus';
const BATCH = 200;

/**
 * Сканер просрочки (мини-спека #37): каждые 5 минут — живые задачи с
 * дедлайном в прошлом, ещё не уведомлённые, получают ОДНОКРАТНОЕ
 * `task.overdue` (уведомление ответственному и постановщику), метка
 * overdue_notified_at сбрасывается сменой срока. Не «краснота каждую минуту».
 * BullMQ Job Scheduler (advanced-scheduled-tasks), горячий путь — частичный
 * индекс tasks_overdue_scan_idx.
 */
@Injectable()
export class OverdueScanner implements OnModuleInit, OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<Record<string, never>>;
  private worker?: Worker<Record<string, never>>;

  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly tasks: TasksRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OverdueScanner.name);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL не задан');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(OVERDUE_QUEUE, { connection: this.connection, prefix: PREFIX });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'overdue-scan',
      { every: 5 * 60_000 },
      { name: 'scan', data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } },
    );
    this.worker = new Worker<Record<string, never>>(
      OVERDUE_QUEUE,
      async () => void (await this.runOnce()),
      {
        connection: this.connection.duplicate(),
        prefix: PREFIX,
        concurrency: 1,
      },
    );
    this.worker.on('failed', (_job, error) =>
      this.logger.warn({ err: error }, 'Сканер просрочки упал (повтор по расписанию)'),
    );
  }

  /** Один проход (public для тестов): число уведомлённых задач. */
  async runOnce(now = new Date()): Promise<number> {
    return this.txRunner.run(async (tx) => {
      const due = await this.tasks.findOverdueToNotify(tx, now, BATCH);
      for (const task of due) {
        await this.tasks.markOverdueNotified(tx, task.id, now);
        await this.eventBus.emit(
          tx,
          TASK_EVENTS.OVERDUE,
          {
            taskId: task.id,
            number: task.number,
            audience: audienceIds(task),
            title: task.title,
            deadline: task.deadline!.toISOString(),
            creatorId: task.creatorId,
            assigneeId: task.assigneeId,
          },
          { actorId: null, aggregateType: 'task', aggregateId: task.id },
        );
      }
      return due.length;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.connection.disconnect();
  }
}
