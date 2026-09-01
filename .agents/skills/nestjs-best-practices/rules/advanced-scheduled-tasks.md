---
title: Use BullMQ Job Schedulers for Cron Jobs and Scheduled Tasks
impact: MEDIUM
section: 13
impactDescription: Ensures reliable periodic task execution outside the HTTP process
tags: advanced, scheduled-tasks, cron, jobs, bullmq, queues
---

Scheduled tasks — cleanup jobs, overdue-task checks, periodic reports, digests — are heavy, periodic work. In Nodus they run **only as BullMQ jobs** (I7: an HTTP request never performs heavy work). BullMQ job schedulers give you persistence in Redis, retries with backoff, observability, and a single scheduler shared by all API replicas. **Never use raw `setInterval`/`setTimeout`, never `@nestjs/schedule`, never external OS cron.**

**Incorrect:**

```typescript
// cleanup.service.ts - Raw timers 🚨
import { Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class CleanupService implements OnModuleDestroy {
  private intervals: NodeJS.Timeout[] = [];

  constructor() {
    // ❌ Raw interval - no NestJS lifecycle, no persistence
    const interval1 = setInterval(() => {
      this.cleanupExpiredSessions().catch(console.error);
    }, 60000);  // Every minute

    // ❌ Another raw interval
    const interval2 = setInterval(() => {
      this.deleteOldLogs().catch(console.error);
    }, 3600000);  // Every hour

    // ❌ Manual interval tracking
    this.intervals.push(interval1, interval2);
  }

  // ❌ Manual cleanup required
  onModuleDestroy() {
    this.intervals.forEach(clearInterval);
  }

  // ❌ No retries on failure, no structured logging
  // ❌ Every API replica runs its own timer — N replicas = N duplicate runs
  // ❌ A deploy/restart silently skips whatever was due
  async cleanupExpiredSessions() {
    await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  // ❌ …and AuditLog is append-only: a job must never delete from it
  //    at all (retention = archiving), two violations in one method
  async deleteOldLogs() {
    await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    });
  }
}

// digest.service.ts - Manual tracking 🚨
@Injectable()
export class DigestService {
  private checkInterval: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {
    // ❌ Manually start interval
    this.startCheckingOverdueTasks();
  }

  private startCheckingOverdueTasks() {
    this.checkInterval = setInterval(async () => {
      try {
        await this.flagOverdueTasks();
      } catch (error) {
        console.error('Overdue check failed:', error);
        // ❌ No structured logging, no retry — the failure is lost
      }
    }, 60 * 60 * 1000);  // Hourly
  }

  private async flagOverdueTasks() {
    // Business logic
  }
}

// report.service.ts - @nestjs/schedule 🚨 (banned in Nodus)
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ReportService {
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generateDailyReport() {
    // 🚨 Runs INSIDE the API process — heavy work blocks the event loop,
    //    the p95 < 200 ms latency budget dies here (I7)
    // 🚨 Every replica fires the cron: 3 replicas = 3 identical reports
    // 🚨 No persistence: a deploy at 02:00 silently skips the run
    // 🚨 No retries, no backoff, no failed-job inspection
  }
}
```

**Correct:**

```typescript
// apps/api/src/infra/queues/queues.module.ts - Queue wiring ✅
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        },
        // ✅ Sane defaults for every job in every queue
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,  // keep the last 100 completed jobs
          removeOnFail: 1000,     // keep failures for inspection
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class QueuesModule {}

// apps/api/src/modules/maintenance/maintenance.module.ts ✅
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceRepository } from './maintenance.repository';

@Module({
  imports: [BullModule.registerQueue({ name: 'maintenance' })],
  providers: [MaintenanceProcessor, MaintenanceScheduler, MaintenanceService, MaintenanceRepository],
})
export class MaintenanceModule {}

// apps/api/src/modules/maintenance/maintenance.scheduler.ts ✅
// Registers repeatable jobs; runs on every boot and on every replica
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

// BullMQ cron patterns are 6-field WITH seconds: sec min hour day month weekday
const MAINTENANCE_SCHEDULES = {
  'cleanup-expired-sessions': { pattern: '0 0 0 * * *' },   // every day at 00:00
  'process-notification-batch': { every: 30_000 },          // every 30 seconds
  'send-weekly-report': { pattern: '0 0 9 * * 1', tz: 'Europe/Minsk' }, // Monday 09:00
} as const;

// No 'delete-old-logs' entry on purpose: AuditLog and the events log are
// append-only — a scheduled job never deletes from them. Retention happens
// by archiving old rows to cold storage (ops runbook), not by a DELETE job.

@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue('maintenance') private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    // ✅ upsertJobScheduler is idempotent: one scheduler record in Redis,
    //    re-upserting on every boot/replica just updates it — never duplicates
    for (const [jobName, repeat] of Object.entries(MAINTENANCE_SCHEDULES)) {
      await this.queue.upsertJobScheduler(jobName, repeat, {
        name: jobName,
        data: {},
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
      });
    }

    // ✅ One-time startup job (replaces @Timeout): fixed jobId dedupes it
    //    across replicas — only the first add wins
    await this.queue.add(
      'seed-initial-data',
      {},
      { delay: 10_000, jobId: 'seed-initial-data', removeOnComplete: true },
    );

    this.logger.log(`Registered ${Object.keys(MAINTENANCE_SCHEDULES).length} job schedulers`);
  }
}

// apps/api/src/modules/maintenance/maintenance.processor.ts ✅
// The worker: thin routing only, business logic lives in the service
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MaintenanceService } from './maintenance.service';

@Processor('maintenance')
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly maintenanceService: MaintenanceService) {
    super();
  }

  // ✅ Let errors THROW — BullMQ retries per job opts.
  //    Swallowing an error marks the job completed and hides the failure.
  async process(job: Job): Promise<void> {
    this.logger.log(`Processing ${job.name} (attempt ${job.attemptsMade + 1})`);

    switch (job.name) {
      case 'cleanup-expired-sessions':
        await this.maintenanceService.cleanupExpiredSessions();
        break;
      case 'process-notification-batch':
        await this.maintenanceService.processNotificationBatch();
        break;
      case 'send-weekly-report':
        await this.maintenanceService.sendWeeklyReport();
        break;
      case 'seed-initial-data':
        await this.maintenanceService.seedInitialData();
        break;
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }
}

// apps/api/src/modules/maintenance/maintenance.service.ts ✅
// Business logic: talks to the repository, emits events via outbox
import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '../../core/events/event-bus';
import { MaintenanceRepository } from './maintenance.repository';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly maintenanceRepository: MaintenanceRepository,
    private readonly eventBus: EventBus, // core EventBus — outbox write in the same tx (I9)
  ) {}

  async cleanupExpiredSessions(): Promise<void> {
    const deleted = await this.maintenanceRepository.deleteExpiredSessions(new Date());
    this.logger.log(`Deleted ${deleted} expired sessions`);
  }

  async processNotificationBatch(): Promise<void> {
    const batch = await this.maintenanceRepository.claimPendingNotifications(50);

    for (const notification of batch) {
      await this.deliver(notification);
    }

    this.logger.debug(`Delivered ${batch.length} notifications`);
  }

  async sendWeeklyReport(): Promise<void> {
    this.logger.log('Generating weekly report...');
    const report = await this.maintenanceRepository.buildWeeklyDigest();

    // ✅ Fan-out via domain event — the notification module picks it up
    //    (catalog: notification.dispatch_requested)
    await this.maintenanceRepository.storeReport(report, (tx) =>
      this.eventBus.emit(tx, 'notification.dispatch_requested', {
        channel: 'email',
        template: 'weekly-digest',
        reportId: report.id,
      }),
    );

    this.logger.log('Weekly report generated, dispatch requested');
  }

  async seedInitialData(): Promise<void> {
    this.logger.log('Running startup initialization...');
    // one-time seed/bootstrap work
    this.logger.log('Startup initialization completed');
  }

  private async deliver(notification: PendingNotification): Promise<void> {
    // channel delivery
  }
}

// apps/api/src/modules/maintenance/maintenance.repository.ts ✅
// The ONLY place Prisma is touched
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class MaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteExpiredSessions(now: Date): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }

  async claimPendingNotifications(limit: number) {
    // claim a batch of pending notifications (e.g. SELECT ... FOR UPDATE SKIP LOCKED)
    return [] as PendingNotification[];
  }

  async buildWeeklyDigest() {
    // aggregate the week's data
    return { id: 'report-id' } as WeeklyDigest;
  }

  // ✅ Outbox row lands in the SAME transaction as the state change (I9):
  //    no phantom events on rollback, no lost events on crash
  async storeReport(
    report: WeeklyDigest,
    emit: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // persist the report
      await emit(tx);
    });
  }
}
```

## A Job Belongs to the Module That Owns the Table

The overdue-task job reads and writes the `task` table — so it lives in the **tasks** module and goes through `TasksRepository`. A module never touches another module's tables (I3), and scheduled jobs are no exception: there is no shared "maintenance" repository reaching into foreign tables. Each module that needs periodic work registers its own queue and schedulers, in the same shape as the maintenance module above.

```typescript
// apps/api/src/modules/tasks/tasks.module.ts ✅
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [BullModule.registerQueue({ name: 'tasks' })],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksRepository,
    OverdueTasksScheduler,  // registers the repeatable job on bootstrap
    OverdueTasksProcessor,  // worker: thin routing to the service
    OverdueTasksService,    // business logic
  ],
})
export class TasksModule {}
```

```typescript
// apps/api/src/modules/tasks/overdue-tasks.scheduler.ts ✅
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OverdueTasksScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(OverdueTasksScheduler.name);

  constructor(@InjectQueue('tasks') private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    // ✅ Same idempotent upsert as the maintenance scheduler — every hour
    await this.queue.upsertJobScheduler(
      'flag-overdue-tasks',
      { pattern: '0 0 * * * *' },
      {
        name: 'flag-overdue-tasks',
        data: {},
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
      },
    );
    this.logger.log('Registered 1 job scheduler');
  }
}
```

```typescript
// apps/api/src/modules/tasks/overdue-tasks.processor.ts ✅
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OverdueTasksService } from './overdue-tasks.service';

@Processor('tasks')
export class OverdueTasksProcessor extends WorkerHost {
  constructor(private readonly overdueTasksService: OverdueTasksService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'flag-overdue-tasks':
        await this.overdueTasksService.flagOverdueTasks();
        break;
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }
}
```

```typescript
// apps/api/src/modules/tasks/overdue-tasks.service.ts ✅
import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../core/database/transaction-runner';
import { EventBus } from '../../core/events/event-bus';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    private readonly tasksRepository: TasksRepository, // ✅ own module's table only
    private readonly txRunner: TransactionRunner,      // core runner owns the tx (patterns.md)
    private readonly eventBus: EventBus,
  ) {}

  // ✅ Idempotent: only tasks not yet flagged are picked up,
  //    so a retried run finds nothing new and sends no duplicate events
  async flagOverdueTasks(): Promise<void> {
    const candidates = await this.tasksRepository.findBecameOverdue(new Date());

    for (const task of candidates) {
      await this.txRunner.run(async (tx) => {
        await this.tasksRepository.markOverdue(task.id, tx);
        await this.eventBus.emit(tx, 'task.overdue', {
          taskId: task.id,
          assigneeId: task.assigneeId,
        });
      });
    }

    this.logger.log(`Flagged ${candidates.length} overdue tasks`);
  }
}
```

`TasksRepository.findBecameOverdue` / `markOverdue(id, tx)` are ordinary methods of the tasks module's own repository (`dueDate < now AND isOverdue = false AND completedAt IS NULL`, then the flag update) — Prisma stays in `*.repository.ts`, and the outbox row commits in the same transaction as the flag (I9).

## Cron Expression Patterns

BullMQ `pattern` is a 6-field cron **with a leading seconds field** (cron-parser syntax). Keep patterns as named constants next to the scheduler registration — there is no `CronExpression` enum in BullMQ.

```typescript
// Format: second minute hour day-of-month month day-of-week

'0 30 6 * * *'     // every day at 06:30
'0 0 9 * * 1'      // every Monday at 09:00
'0 */5 * * * *'    // every 5 minutes
'0 0 17 * * 1-5'   // every weekday at 17:00
'0 0 */6 * * *'    // every 6 hours
'0 0 0 1 * *'      // first day of every month at midnight
'0 30 14 * * 2,4'  // every Tuesday and Thursday at 14:30
'*/10 * * * * *'   // every 10 seconds
'0 0 9-17 * * *'   // every hour between 09:00 and 17:00
```

Two non-cron alternatives in the repeat options:

```typescript
{ every: 30_000 }                          // fixed millisecond interval
{ pattern: '0 0 9 * * 1', tz: 'Europe/Minsk' } // pin timezone for business-time jobs
```

> Pin `tz` for jobs whose meaning is wall-clock business time (09:00 Monday in Minsk). Without `tz` the pattern follows the server's local timezone, which shifts silently if the container timezone changes.

## Dynamic Scheduler Management

The equivalent of `@nestjs/schedule`'s `SchedulerRegistry` is the queue API itself — plus re-upserting a scheduler to change it:

```typescript
// apps/api/src/modules/maintenance/maintenance-admin.service.ts ✅
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ErrorCode } from '@nodus/contracts';
import { DomainException } from '../../core/errors/domain-exception';

@Injectable()
export class MaintenanceAdminService {
  private readonly logger = new Logger(MaintenanceAdminService.name);

  constructor(@InjectQueue('maintenance') private readonly queue: Queue) {}

  // ✅ List all registered schedulers (id, pattern/every, next run)
  listSchedulers() {
    return this.queue.getJobSchedulers();
  }

  // ✅ Change a schedule: re-upsert with the SAME scheduler id and the full template
  async rescheduleWeeklyReport(pattern: string) {
    await this.queue.upsertJobScheduler(
      'send-weekly-report',
      { pattern, tz: 'Europe/Minsk' },
      { name: 'send-weekly-report', data: {}, opts: { attempts: 3 } },
    );
    this.logger.log(`send-weekly-report rescheduled to "${pattern}"`);
  }

  // ✅ Remove a scheduler entirely
  async removeScheduler(schedulerId: string) {
    const removed = await this.queue.removeJobScheduler(schedulerId);
    if (removed === 0) {
      throw new DomainException(ErrorCode.NOT_FOUND, `Scheduler "${schedulerId}" not found`);
    }
    this.logger.log(`Scheduler ${schedulerId} removed`);
  }

  // ✅ Pause/resume — NOTE: this pauses the whole queue (on-demand jobs too).
  //    There is no per-scheduler pause: remove the scheduler and re-upsert it later.
  pauseQueue() {
    return this.queue.pause();
  }

  resumeQueue() {
    return this.queue.resume();
  }
}
```

## Overlapping Executions and Idempotency

A repeatable scheduler can start the next occurrence while the previous instance of the same job is still running (worker concurrency > 1, or several API replicas each hosting a worker). Defense in depth:

1. **Make every handler idempotent** — the primary rule. `flagOverdueTasks` above only picks tasks with `isOverdue: false`, so a second concurrent run processes an empty set. Cleanup jobs (`deleteMany` by a time threshold) are naturally idempotent.
2. **Restrict concurrency for jobs that must not overlap:**

```typescript
// ✅ This queue's jobs run strictly one at a time per worker
@Processor('maintenance', { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost { /* ... */ }
```

3. **Claim batches atomically** when several workers compete for the same work (`SELECT ... FOR UPDATE SKIP LOCKED` via the repository), so two instances of `process-notification-batch` never deliver the same notification twice.

Do **not** reintroduce in-memory `isProcessing` flags from raw-timer code — they don't coordinate across replicas and vanish on restart; idempotency and queue semantics replace them.

## Monitoring Scheduled Tasks

```typescript
// apps/api/src/modules/maintenance/queue-monitor.service.ts ✅
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const FAILED_JOBS_ALERT_THRESHOLD = 10;

@Injectable()
export class QueueMonitorService {
  private readonly logger = new Logger(QueueMonitorService.name);

  constructor(@InjectQueue('maintenance') private readonly queue: Queue) {}

  // ✅ Registered as its own hourly scheduler ('report-queue-health')
  async reportQueueHealth(): Promise<void> {
    const counts = await this.queue.getJobCounts('wait', 'active', 'delayed', 'failed');
    const schedulers = await this.queue.getJobSchedulers();

    this.logger.log(
      `Queue "maintenance": ${JSON.stringify(counts)}, schedulers: ${schedulers.length}`,
    );

    if (counts.failed > FAILED_JOBS_ALERT_THRESHOLD) {
      const failed = await this.queue.getJobs(['failed'], 0, 20);
      this.logger.error(
        `${counts.failed} failed jobs in "maintenance": ` +
          failed.map((job) => `${job.name} (${job.failedReason})`).join(', '),
      );
      // surface to the alerting channel — failed jobs are invisible otherwise
    }
  }
}
```

## Testing Scheduled Tasks

Unit tests sit next to the code (`<entity>.test.ts`, Vitest). The processor is tested with a mocked service, the service with a mocked repository — no Redis needed. Repeat-timing itself is covered by integration tests against real Redis in docker, not by unit mocks.

```typescript
// apps/api/src/modules/maintenance/maintenance.processor.test.ts ✅
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { MaintenanceProcessor } from './maintenance.processor';
import type { MaintenanceService } from './maintenance.service';

describe('MaintenanceProcessor', () => {
  const service = {
    cleanupExpiredSessions: vi.fn(),
    processNotificationBatch: vi.fn(),
    sendWeeklyReport: vi.fn(),
    seedInitialData: vi.fn(),
  };

  let processor: MaintenanceProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new MaintenanceProcessor(service as unknown as MaintenanceService);
  });

  it('routes the job to the matching service method', async () => {
    await processor.process({ name: 'cleanup-expired-sessions', attemptsMade: 0 } as Job);

    expect(service.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
    expect(service.sendWeeklyReport).not.toHaveBeenCalled();
  });

  it('rethrows so BullMQ retries the job', async () => {
    service.cleanupExpiredSessions.mockRejectedValue(new Error('Database error'));

    await expect(
      processor.process({ name: 'cleanup-expired-sessions', attemptsMade: 0 } as Job),
    ).rejects.toThrow('Database error');
  });

  it('throws on unknown job names', async () => {
    await expect(processor.process({ name: 'nope' } as Job)).rejects.toThrow(
      'Unknown job name',
    );
  });
});
```

```typescript
// apps/api/src/modules/tasks/overdue-tasks.service.test.ts ✅
import { describe, it, expect, vi } from 'vitest';
import { OverdueTasksService } from './overdue-tasks.service';
import type { TasksRepository } from './tasks.repository';
import type { TransactionRunner } from '../../core/database/transaction-runner';
import type { EventBus } from '../../core/events/event-bus';

describe('OverdueTasksService', () => {
  it('flags newly overdue tasks and emits task.overdue via outbox', async () => {
    const repository = {
      findBecameOverdue: vi.fn().mockResolvedValue([{ id: 't1', assigneeId: 'u1' }]),
      markOverdue: vi.fn(),
    };
    // TransactionRunner executes the callback with the transaction client
    const txRunner = { run: vi.fn((cb: (tx: unknown) => unknown) => cb('tx')) };
    const eventBus = { emit: vi.fn() };
    const service = new OverdueTasksService(
      repository as unknown as TasksRepository,
      txRunner as unknown as TransactionRunner,
      eventBus as unknown as EventBus,
    );

    await service.flagOverdueTasks();

    expect(repository.markOverdue).toHaveBeenCalledWith('t1', 'tx');
    // ✅ the event goes through the outbox transaction, never a direct publish
    expect(eventBus.emit).toHaveBeenCalledWith('tx', 'task.overdue', {
      taskId: 't1',
      assigneeId: 'u1',
    });
  });

  it('does nothing when no task became overdue (idempotent retry)', async () => {
    const repository = {
      findBecameOverdue: vi.fn().mockResolvedValue([]),
      markOverdue: vi.fn(),
    };
    const txRunner = { run: vi.fn() };
    const eventBus = { emit: vi.fn() };
    const service = new OverdueTasksService(
      repository as unknown as TasksRepository,
      txRunner as unknown as TransactionRunner,
      eventBus as unknown as EventBus,
    );

    await service.flagOverdueTasks();

    expect(txRunner.run).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
```

```typescript
// apps/api/src/modules/maintenance/maintenance.scheduler.test.ts ✅
import { describe, it, expect, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { MaintenanceScheduler } from './maintenance.scheduler';

describe('MaintenanceScheduler', () => {
  it('registers all schedulers idempotently on bootstrap', async () => {
    const queue = { upsertJobScheduler: vi.fn(), add: vi.fn() };
    const scheduler = new MaintenanceScheduler(queue as unknown as Queue);

    await scheduler.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'cleanup-expired-sessions',
      { pattern: '0 0 0 * * *' },
      expect.objectContaining({ name: 'cleanup-expired-sessions' }),
    );
    // one-time job uses a fixed jobId so replicas can't duplicate it
    expect(queue.add).toHaveBeenCalledWith(
      'seed-initial-data',
      {},
      expect.objectContaining({ jobId: 'seed-initial-data' }),
    );
  });
});
```

## Best Practices Summary

| Practice | Why |
|----------|-----|
| BullMQ job schedulers, never raw timers | Persistence in Redis, retries, one scheduler across replicas |
| Never `@nestjs/schedule` | In-process: duplicates across replicas, dies on deploy, blocks the event loop (I7) |
| Register via `upsertJobScheduler` on bootstrap | Idempotent — safe to run on every boot and every replica |
| Processor thin, logic in the service | Business rules stay unit-testable without Redis |
| Service → repository; Prisma only in the repository | patterns.md layering, one point for tuning |
| Jobs live in the module that owns the table | Cross-module table access is forbidden (I3) — schedulers included |
| AuditLog / events log are append-only | Retention via archiving (ops runbook); never a DELETE job |
| Throw on failure | BullMQ retries per job opts; swallowing = silent "success" |
| Every handler idempotent | Jobs are retried and can overlap across workers |
| Events via outbox in the same transaction (I9) | No phantom events on rollback, no lost events on crash |
| Fixed `jobId` for one-time jobs | Deduped across replicas — first add wins |
| Pin `tz` for business-time schedules | Container timezone changes must not shift 09:00 Monday |
| Monitor failed counts | Failed jobs retry silently, then sit invisible until checked |
| Heavy work only in queues | Keeps the API's p95 < 200 ms budget intact (I7) |
