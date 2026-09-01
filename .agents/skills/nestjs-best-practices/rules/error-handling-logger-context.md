---
title: Use Logger with Module Context for Debugging
impact: MEDIUM
impactDescription: Improves debugging with contextual log messages
section: 4
tags: logging, error-handling, debugging, logger, context
---

Using `console.log()` or generic loggers without context makes debugging difficult in production. NestJS's built-in Logger with module context prefixes each message with the source class, making it easy to trace where logs originate. In production the built-in logger is swapped for structured pino output (see `error-handling-structured-logging.md`) — the contextual habits in this rule apply in both worlds, because pino keeps the same `context` field.

Two Nodus-specific rules on top:

- **Never log secrets or PII-heavy payloads** — no passwords, tokens, session cookies, full request bodies. Log identifiers (`userId`, `taskId`) and shapes, not contents.
- **Log business events as audit trail, not as domain events.** A log line is for humans debugging; the `events` outbox is for the system. Writing `task.completed` into a log does not replace the outbox event (I9) — you need both.

## For AI Agents

When implementing or reviewing logging, **always** follow these steps:

### Step 1: Check for Console Logging or Contextless Loggers
**Pattern to check:** Look for `console.log()`, `console.error()`, or `new Logger()` without a context parameter.

```typescript
// ❌ WRONG - Console logging with no context
console.log('Task created:', task);
console.error('Error:', error);

// ❌ WRONG - Logger without module context
@Injectable()
export class TasksService {
  private logger = new Logger(); // ❌ No context

  createTask(dto: CreateTaskDto) {
    this.logger.log('Creating task'); // ❌ No class prefix in output
  }
}

// ❌ WRONG - Generic context
@Injectable()
export class TasksService {
  private logger = new Logger('Service'); // ❌ Too generic
}

// ❌ WRONG - Logging sensitive data
this.logger.log(`Login attempt: ${email} / ${password}`); // 🚨 credential leak
this.logger.debug(`Request body: ${JSON.stringify(body)}`); // 🚨 may contain tokens/PII
```

**If found:** Replace with a contextual Logger and strip sensitive fields.

### Step 2: Create Logger with Class Context

```typescript
// ✅ REQUIRED: Use the class name as context
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TasksService {
  // ✅ Logger with class name as context
  private readonly logger = new Logger(TasksService.name);

  createTask(dto: CreateTaskDto) {
    this.logger.log('Creating task');
    // Output: [TasksService] Creating task
  }
}
```

### Step 3: Use Appropriate Log Levels

```typescript
// ✅ REQUIRED: Use appropriate log levels
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  // ✅ LOG - Significant business events (created, completed, sent)
  async completeTask(id: string, user: AuthUser) {
    const task = await this.getById(id);
    // ...transition...
    this.logger.log(`Task "${id}" completed by user "${user.id}"`);
    return task;
  }

  // ✅ VERBOSE - Detailed tracing (disabled by default in production)
  findAll(user: AuthUser, filters: GetTasksFilterDto) {
    this.logger.verbose(
      `User "${user.id}" retrieving tasks. Filters: ${JSON.stringify(filters)}`,
    );
    return this.tasksRepository.findPageByAssignee(user.id, filters);
  }

  // ✅ DEBUG - Diagnostic detail for development
  async recomputeWorkload(projectId: string) {
    this.logger.debug(`Recomputing workload for project "${projectId}"`);
    // ...
  }

  // ✅ WARN - Suspicious but handled situations
  async updateTask(id: string, dto: UpdateTaskDto) {
    const task = await this.getById(id);
    if (task.status !== dto.status) {
      this.logger.warn(
        `Task "${id}" status changing from "${task.status}" to "${dto.status}"`,
      );
    }
    // ...
  }

  // ✅ ERROR - Failures, with the stack trace as second argument
  async processWithError() {
    try {
      // ...
    } catch (error) {
      this.logger.error('Processing failed', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
```

### Step 4: Log Important Business Events

```typescript
// ✅ REQUIRED: Log the events you'd want in an audit/debug trail
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  async createTask(dto: CreateTaskDto, user: AuthUser) {
    this.logger.log(`Creating task "${dto.title}" for assignee "${dto.assigneeId}" by "${user.id}"`);

    const task = await this.txRunner.run(async (tx) => {
      const created = await this.tasksRepository.create({ ...dto }, tx);
      await this.eventBus.emit(tx, 'task.created', {
        taskId: created.id,
        projectId: created.projectId,
        assigneeId: created.assigneeId,
      });
      return created;
    });

    // ✅ Log line is the human trail; the outbox event above is the system one
    this.logger.log(`Task created with ID "${task.id}"`);
    return task;
  }

  async logTime(taskId: string, dto: LogTimeDto, user: AuthUser) {
    const entry = await this.tasksService.logTimeEntry(taskId, dto, user);
    this.logger.log(
      `User "${user.id}" logged ${dto.minutes}min on task "${taskId}" (entry "${entry.id}")`,
    );
    return entry;
  }
}
```

### Step 5: Log Request Details in Controllers

```typescript
// ✅ OPTIONAL: Verbose request tracing at the HTTP edge
import { Controller, Get, Post, Body, Param, Query, Logger } from '@nestjs/common';

@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery, @GetUser() user: AuthUser) {
    // ✅ VERBOSE, not LOG — per-request noise stays out of production defaults
    this.logger.verbose(
      `User "${user.id}" retrieving tasks. Filters: ${JSON.stringify(query.filter)}`,
    );
    return this.tasksService.getTasksPage(user.id, query.filter, query.cursor, query.limit);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto, @GetUser() user: AuthUser) {
    // ✅ Creation is a business event — LOG level
    this.logger.log(`User "${user.id}" creating task "${dto.title}"`);
    return this.tasksService.createTask(dto, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: AuthUser) {
    this.logger.verbose(`User "${user.id}" retrieving task "${id}"`);
    return this.tasksService.getById(id);
  }
}
```

### Step 6: Handle Errors with Context

```typescript
// ✅ REQUIRED: Log errors where you have context; let the global filter
// handle the response (error-handling-exception-filter.md)
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  async getById(id: string) {
    const task = await this.tasksRepository.findById(id);

    if (!task) {
      // ✅ Expected "error" (missing entity) — WARN, then domain exception
      this.logger.warn(`Task "${id}" not found`);
      throw new TaskNotFoundException(id);
    }

    return task;
  }

  async updateTask(id: string, dto: UpdateTaskDto) {
    try {
      const before = await this.getById(id);
      this.logger.log(`Updating task "${id}" fields: ${Object.keys(dto).join(', ')}`);
      // ...
    } catch (error) {
      // ✅ Re-throw domain exceptions untouched (filter maps them);
      //    log only unexpected failures as ERROR with the stack
      if (error instanceof TaskNotFoundException) throw error;

      this.logger.error(
        `Failed to update task "${id}"`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
```

**Anti-pattern:** catching, logging at ERROR, and swallowing (returning `null`/`undefined`). The exception filter then sees a "successful" `null` and the client gets a confusing empty 200 while the real failure hides in logs. Log **and** rethrow — or handle fully, never half-handle.

### Step 7: Bootstrap Log Levels (Fastify Adapter)

```typescript
// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // ✅ genReqId: every request gets a UUID trace id (Fastify honors an
    //    incoming x-request-id header first — useful from the gateway).
    //    This id is the traceId in API error responses.
    new FastifyAdapter({ genReqId: () => randomUUID() }),
    {
      // ✅ Level set by environment
      logger:
        process.env.NODE_ENV === 'production'
          ? ['log', 'error', 'warn']
          : ['log', 'error', 'warn', 'debug', 'verbose'],
    },
  );

  await app.listen(Number(process.env.API_PORT), '0.0.0.0');
}
```

## Installation

No packages needed — `Logger` is built into `@nestjs/common`. (For structured JSON production logging, `nestjs-pino` is configured separately — see `error-handling-structured-logging.md`.)

**Incorrect:**

```typescript
// tasks/tasks.service.ts - Console logging 🚨
import { Injectable } from '@nestjs/common';

@Injectable()
export class TasksService {
  constructor(private tasksRepository: TasksRepository) {}

  // ❌ console.log - no context, no levels, not captured by log pipeline
  async createTask(dto: CreateTaskDto, user: AuthUser) {
    console.log('Creating task');
    const task = await this.tasksRepository.create(dto);
    console.log('Task created:', task); // ❌ dumps the whole entity
    return task;
  }

  // ❌ console.error for errors — loses stack, no correlation
  async deleteTask(id: string) {
    try {
      return await this.tasksRepository.delete(id);
    } catch (error) {
      console.error('Error deleting task:', error);
      // ❌ and swallows the error — caller sees undefined success
    }
  }

  // ❌ No logging at all on a business-significant mutation
  async completeTask(id: string) {
    return this.tasksRepository.markCompleted(id, new Date());
  }
}
```

**Correct:**

```typescript
// tasks/tasks.service.ts - Contextual logging ✅
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TasksService {
  // ✅ Logger with class context
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  // ✅ Business events at LOG with identifiers, not entity dumps
  async createTask(dto: CreateTaskDto, user: AuthUser) {
    this.logger.log(`User "${user.id}" creating task "${dto.title}"`);

    const task = await this.txRunner.run(async (tx) => {
      const created = await this.tasksRepository.create(dto, tx);
      await this.eventBus.emit(tx, 'task.created', {
        taskId: created.id,
        projectId: created.projectId,
        assigneeId: created.assigneeId,
      });
      return created;
    });

    this.logger.log(`Task "${task.id}" created`);
    return task;
  }

  // ✅ Errors logged with stack, then rethrown for the global filter
  async completeTask(id: string, user: AuthUser) {
    try {
      const task = await this.getById(id);
      if (task.completedAt) return task; // idempotent — see repository rule

      const completed = await this.txRunner.run(async (tx) => {
        const done = await this.tasksRepository.markCompleted(id, new Date(), tx);
        await this.eventBus.emit(tx, 'task.completed', { taskId: id, assigneeId: task.assigneeId });
        return done;
      });

      this.logger.log(`Task "${id}" completed by user "${user.id}"`);
      return completed;
    } catch (error) {
      if (error instanceof TaskNotFoundException) throw error;
      this.logger.error(
        `Failed to complete task "${id}"`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // ✅ Tracing noise at VERBOSE
  async getTasksPage(user: AuthUser, filter: TaskPageFilter, cursor?: string, limit?: number) {
    this.logger.verbose(
      `User "${user.id}" retrieving tasks with filters: ${JSON.stringify(filter)}`,
    );
    return this.tasksRepository.findPageByAssignee(user.id, filter, cursor, limit);
  }
}
```

## Advanced: Request ID / Trace ID

Every Fastify request already carries an id (`request.id`, from the `x-request-id` header or `genReqId`) — the same id the exception filter puts into the error body as `traceId`. No Express-style middleware is needed. Use it when you log inside request scope:

```typescript
// ✅ Correlating a log line with its request — interceptor-free approach:
// read the id where you already have the request (controllers, guards).
@Post()
create(
  @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
  @GetUser() user: AuthUser,
  @Req() req: FastifyRequest,
) {
  this.logger.log(`[${req.id}] User "${user.id}" creating task "${dto.title}"`);
  return this.tasksService.createTask(dto, user.id);
}
```

For request-scoped correlation **inside services** without plumbing the request through, use REQUEST scope sparingly (it instantiates the whole provider chain per request — measurable overhead on hot paths):

```typescript
// ✅ OPTIONAL: request-scoped provider pulling the trace id from the request
import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { FastifyRequest } from 'fastify';

@Injectable({ scope: Scope.REQUEST })
export class OverdueTasksReportService {
  private readonly logger = new Logger(OverdueTasksReportService.name);

  constructor(@Inject(REQUEST) private readonly request: FastifyRequest) {}

  async generate() {
    this.logger.log(`[${this.request.id}] Generating overdue report`);
    // Output: [OverdueTasksReportService] [f47ac10b-...] Generating overdue report
  }
}
```

The production-grade answer is `nestjs-pino`: it binds `req.id`, method, url and any `logger.assign()`ed fields to **every** log line of the request automatically, without REQUEST-scoped providers. That setup — plus redaction of secrets — is in `error-handling-structured-logging.md`; prefer it over hand-rolled correlation once `core/logging` is in place.

## Optional: Custom Logger Service

When you need a custom format but not the full pino stack (e.g. a CLI script inside the repo), a transient `LoggerService` implementation is the seam:

```typescript
// ✅ OPTIONAL: custom logger with pluggable context
// core/logging/app.logger.ts
import { Injectable, LoggerService, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context = 'App';

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, ...optionalParams: unknown[]) {
    this.print(message, 'LOG', optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.print(message, 'ERROR', optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.print(message, 'WARN', optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.print(message, 'DEBUG', optionalParams);
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    this.print(message, 'VERBOSE', optionalParams);
  }

  private print(message: string, level: string, optionalParams: unknown[]) {
    const timestamp = new Date().toISOString(); // UTC ISO 8601, like everywhere (I7)
    process.stdout.write(
      `[${timestamp}] [${this.context}] [${level}] ${message} ${optionalParams
        .map((p) => (p instanceof Error ? p.stack : String(p)))
        .join(' ')}\n`,
    );
  }
}
```

## Best Practices Summary

| Practice | Why |
|----------|-----|
| `new Logger(Class.name)` per class | Context prefix in every message |
| Levels by intent: verbose/debug/warn/log/error | Production stays readable; tracing is one env var away |
| Log business events with ids, not entity dumps | Audit trail without PII/data leaks |
| Never log credentials, tokens, full bodies | Logs are aggregated and retained — treat them as semi-public |
| ERROR level includes the stack | Postmortems without a repro |
| Log **and** rethrow | The global filter owns the response; half-handled errors vanish |
| Fastify `request.id` = error `traceId` | One id links client report ↔ error body ↔ log lines |
| Log line ≠ domain event | Outbox (I9) is the system trail; logs are the human trail |

**See also:** `error-handling-structured-logging.md` for pino/JSON production logging with automatic request context and redaction.
